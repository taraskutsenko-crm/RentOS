import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Customer, CustomerRefreshToken, Prisma, Tenant } from "@prisma/client";
import type { ApiEnv } from "@rentos/shared";

import type { RequestMeta } from "../../auth/auth.service";
import { PasswordService } from "../../auth/password.service";
import { PrismaService } from "../../prisma/prisma.service";
import { hashCustomerInvitationToken } from "../common/customer-invitation-token.util";
import { toPublicCustomer, type PublicCustomer } from "../common/public-customer.mapper";
import { CustomerTokenService } from "./customer-token.service";

type DbClient = Prisma.TransactionClient | PrismaService;

export interface PortalSessionResult {
  customer: PublicCustomer;
  tenant: Tenant;
  accessToken: string;
  refreshToken: string;
}

/**
 * Customer-portal equivalent of AuthService — deliberately a separate
 * class, not an extension of AuthService, since the two auth flows share
 * no state (Customer vs. User) and only the *shape* of the flow is
 * mirrored. See docs/adr/0012-customer-portal.md.
 */
@Injectable()
export class PortalAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<ApiEnv, true>,
    private readonly passwordService: PasswordService,
    private readonly customerTokenService: CustomerTokenService,
  ) {}

  async login(
    tenantSlug: string,
    email: string,
    password: string,
    meta: RequestMeta,
  ): Promise<PortalSessionResult> {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant || !tenant.isActive || tenant.deletedAt) {
      throw new UnauthorizedException("Invalid company, email, or password");
    }

    const customer = await this.prisma.customer.findFirst({
      where: { tenantId: tenant.id, email, deletedAt: null },
      omit: { portalPasswordHash: false },
    });

    if (!customer?.portalActivatedAt || !customer.portalPasswordHash) {
      throw new UnauthorizedException("Invalid company, email, or password");
    }
    if (customer.status !== "ACTIVE") {
      throw new UnauthorizedException("This account is inactive");
    }

    const validPassword = await this.passwordService.verify(customer.portalPasswordHash, password);
    if (!validPassword) {
      throw new UnauthorizedException("Invalid company, email, or password");
    }

    const refreshToken = await this.issueRefreshToken(this.prisma, customer.id, tenant.id, meta);
    const accessToken = this.customerTokenService.signAccessToken(customer.id, tenant.id);

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { portalLastLoginAt: new Date() },
    });

    await this.logAudit(tenant.id, customer.id, "customer_portal.login", meta);

    return {
      customer: toPublicCustomer(customer),
      tenant,
      accessToken,
      refreshToken: refreshToken.plainToken,
    };
  }

  /** Validates and consumes an invitation token, sets the customer's portal password, and logs them in. */
  async activateInvitation(
    token: string,
    password: string,
    meta: RequestMeta,
  ): Promise<PortalSessionResult> {
    const tokenHash = hashCustomerInvitationToken(token);
    const customer = await this.prisma.customer.findFirst({
      where: { portalInvitationTokenHash: tokenHash, deletedAt: null },
      omit: { portalInvitationTokenHash: false },
    });

    if (
      !customer ||
      !customer.portalInvitationExpiresAt ||
      customer.portalInvitationExpiresAt < new Date()
    ) {
      throw new NotFoundException("This invitation link is invalid or has expired");
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: customer.tenantId } });
    const portalPasswordHash = await this.passwordService.hash(password);

    let updated: Customer;
    try {
      updated = await this.prisma.customer.update({
        where: { id: customer.id },
        data: {
          portalPasswordHash,
          portalActivatedAt: new Date(),
          portalInvitationTokenHash: null,
          portalInvitationExpiresAt: null,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          "Another portal account already exists for this email at this company",
        );
      }
      throw error;
    }

    const refreshToken = await this.issueRefreshToken(this.prisma, updated.id, tenant.id, meta);
    const accessToken = this.customerTokenService.signAccessToken(updated.id, tenant.id);

    await this.logAudit(tenant.id, updated.id, "customer_portal.activated", meta);

    return {
      customer: toPublicCustomer(updated),
      tenant,
      accessToken,
      refreshToken: refreshToken.plainToken,
    };
  }

  /** Backs GET /portal/auth/me — mirrors login/activateInvitation's `{ customer, tenant }` shape exactly. */
  async getSession(
    customer: PublicCustomer,
  ): Promise<{ customer: PublicCustomer; tenant: Tenant }> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: customer.tenantId } });
    return { customer, tenant };
  }

  async refresh(
    presentedToken: string,
    meta: RequestMeta,
  ): Promise<{ accessToken: string; refreshToken: string; tenantId: string }> {
    const tokenHash = this.customerTokenService.hashToken(presentedToken);
    const existing = await this.prisma.customerRefreshToken.findUnique({ where: { tokenHash } });

    if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid or expired session");
    }

    const rotated = await this.prisma.$transaction(async (tx) => {
      await tx.customerRefreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
      return this.issueRefreshToken(tx, existing.customerId, existing.tenantId, meta);
    });

    const accessToken = this.customerTokenService.signAccessToken(
      existing.customerId,
      existing.tenantId,
    );

    return { accessToken, refreshToken: rotated.plainToken, tenantId: existing.tenantId };
  }

  async logout(presentedToken: string | undefined, customerId?: string): Promise<void> {
    if (presentedToken) {
      const tokenHash = this.customerTokenService.hashToken(presentedToken);
      await this.prisma.customerRefreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    if (customerId) {
      await this.prisma.auditLog.create({
        data: {
          userId: null,
          action: "customer_portal.logout",
          entityType: "Customer",
          entityId: customerId,
          metadata: { customerId },
        },
      });
    }
  }

  private async issueRefreshToken(
    client: DbClient,
    customerId: string,
    tenantId: string,
    meta: RequestMeta,
  ): Promise<CustomerRefreshToken & { plainToken: string }> {
    const { token, tokenHash } = this.customerTokenService.generateRefreshToken();
    const ttlDays = this.configService.get("REFRESH_TOKEN_TTL_DAYS", { infer: true });
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    const record = await client.customerRefreshToken.create({
      data: {
        customerId,
        tenantId,
        tokenHash,
        expiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });

    return { ...record, plainToken: token };
  }

  private async logAudit(
    tenantId: string,
    customerId: string,
    action: string,
    meta: RequestMeta,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: null,
        action,
        entityType: "Customer",
        entityId: customerId,
        metadata: { customerId },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}
