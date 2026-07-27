import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma, RefreshToken } from "@prisma/client";
import { isSupportedCountryCode, type ApiEnv } from "@rentos/shared";

import { AuditService } from "../audit/audit.service";
import { MembershipsService } from "../memberships/memberships.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantsService } from "../tenants/tenants.service";
import { normalizeEmail } from "../users/email.util";
import { toPublicUser } from "../users/user.mapper";
import { UsersService } from "../users/users.service";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<ApiEnv, true>,
    private readonly usersService: UsersService,
    private readonly tenantsService: TenantsService,
    private readonly membershipsService: MembershipsService,
    private readonly auditService: AuditService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async register(dto: RegisterDto, meta: RequestMeta) {
    const email = normalizeEmail(dto.email);

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }

    if (!isSupportedCountryCode(dto.countryCode)) {
      throw new ConflictException(`Unsupported country code: ${dto.countryCode}`);
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const user = await this.usersService.create(tx, {
          email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          preferredLanguage: dto.defaultLanguage,
        });

        const tenant = await this.tenantsService.create(tx, {
          name: dto.companyName,
          countryCode: dto.countryCode,
          defaultLanguage: dto.defaultLanguage,
          defaultCurrency: dto.defaultCurrency,
          timezone: dto.timezone,
        });

        const membership = await this.membershipsService.create(tx, {
          tenantId: tenant.id,
          userId: user.id,
          role: "OWNER",
        });

        const refreshToken = await this.issueRefreshToken(tx, user.id, tenant.id, meta);

        await this.auditService.log(
          {
            tenantId: tenant.id,
            userId: user.id,
            action: "auth.register",
            entityType: "User",
            entityId: user.id,
            metadata: { tenantId: tenant.id, membershipId: membership.id },
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
          },
          tx,
        );

        return { user, tenant, refreshToken };
      });

      const accessToken = this.tokenService.signAccessToken(result.user.id);

      return {
        user: toPublicUser(result.user),
        tenant: result.tenant,
        accessToken,
        refreshToken: result.refreshToken.plainToken,
      };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException("An account with this email already exists");
      }
      throw error;
    }
  }

  async login(dto: LoginDto, meta: RequestMeta) {
    const email = normalizeEmail(dto.email);
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException("Invalid email or password");
    }

    if (!user.isActive || user.deletedAt) {
      throw new UnauthorizedException("This account is inactive");
    }

    const validPassword = await this.passwordService.verify(user.passwordHash, dto.password);
    if (!validPassword) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const refreshToken = await this.issueRefreshToken(this.prisma, user.id, null, meta);
    const accessToken = this.tokenService.signAccessToken(user.id);

    await this.auditService.log({
      userId: user.id,
      action: "auth.login",
      entityType: "User",
      entityId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      user: toPublicUser(user),
      accessToken,
      refreshToken: refreshToken.plainToken,
    };
  }

  async refresh(presentedToken: string, meta: RequestMeta) {
    const tokenHash = this.tokenService.hashToken(presentedToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const rotated = await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
      return this.issueRefreshToken(tx, existing.userId, existing.tenantId, meta);
    });

    const accessToken = this.tokenService.signAccessToken(existing.userId);

    return {
      accessToken,
      refreshToken: rotated.plainToken,
      tenantId: existing.tenantId,
    };
  }

  async logout(presentedToken: string | undefined, userId?: string): Promise<void> {
    if (presentedToken) {
      const tokenHash = this.tokenService.hashToken(presentedToken);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    if (userId) {
      await this.auditService.log({
        userId,
        action: "auth.logout",
        entityType: "User",
        entityId: userId,
      });
    }
  }

  private async issueRefreshToken(
    client: DbClient,
    userId: string,
    tenantId: string | null,
    meta: RequestMeta,
  ): Promise<RefreshToken & { plainToken: string }> {
    const { token, tokenHash } = this.tokenService.generateRefreshToken();
    const ttlDays = this.configService.get("REFRESH_TOKEN_TTL_DAYS", { infer: true });
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    const record = await client.refreshToken.create({
      data: {
        userId,
        tenantId,
        tokenHash,
        expiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });

    return { ...record, plainToken: token };
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
