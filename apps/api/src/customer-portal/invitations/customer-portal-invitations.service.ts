import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnv } from "@rentos/shared";

import { AuditService } from "../../audit/audit.service";
import { CustomersService } from "../../customers/customers.service";
import { EmailService } from "../../email/email.service";
import { PrismaService } from "../../prisma/prisma.service";
import { generateCustomerInvitationToken } from "../common/customer-invitation-token.util";
import type { InviteCustomerDto } from "../dto/invite-customer.dto";

const INVITATION_TTL_DAYS = 14;

export interface PortalInvitationResult {
  invited: boolean;
  email: string;
  expiresAt: Date;
  emailSent: boolean;
  /**
   * The activation link, returned directly to the inviting staff member —
   * same rationale as DocumentSharingService.create() returning its
   * plaintext token: only the LoggingEmailProvider is bound today (no real
   * delivery), so staff need a way to hand the link to the customer
   * themselves until a real provider is configured. Never persisted or
   * retrievable again after this response.
   */
  inviteLink: string;
}

export interface PortalAccessStatus {
  invited: boolean;
  activated: boolean;
  invitedAt: Date | null;
  activatedAt: Date | null;
  lastLoginAt: Date | null;
  invitationExpired: boolean | null;
}

/**
 * Staff-side management of a Customer's portal access — invite, revoke,
 * status. Deliberately its own service rather than folded into
 * CustomersService: this is a distinct concern (auth lifecycle) layered on
 * top of the existing Customer record, the same way DocumentSharingService
 * sits alongside DocumentsService rather than inside it.
 */
@Injectable()
export class CustomerPortalInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customersService: CustomersService,
    private readonly emailService: EmailService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService<ApiEnv, true>,
  ) {}

  async invite(
    tenantId: string,
    customerId: string,
    actorUserId: string,
    dto: InviteCustomerDto,
  ): Promise<PortalInvitationResult> {
    const customer = await this.customersService.findOne(tenantId, customerId);
    const email = dto.email ?? customer.email;
    if (!email) {
      throw new BadRequestException(
        "This customer has no email on file — provide one to send the invitation",
      );
    }

    const { token, tokenHash } = generateCustomerInvitationToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        portalInvitationTokenHash: tokenHash,
        portalInvitationExpiresAt: expiresAt,
        portalInvitedAt: new Date(),
      },
    });

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const webOrigin = this.configService.get("WEB_ORIGIN", { infer: true });
    const inviteLink = `${webOrigin}/portal/invite/${token}`;

    const emailResult = await this.emailService.send({
      to: email,
      subject: `You're invited to the ${tenant.name} customer portal`,
      html: `<p>Hello ${escapeHtml(customer.firstName)},</p>
<p>${escapeHtml(tenant.name)} has invited you to their customer portal, powered by Havelio, where you can view your rentals, download and sign documents, request extensions, and message your account team directly.</p>
<p><a href="${inviteLink}">Activate your account</a></p>
<p>This link expires in ${INVITATION_TTL_DAYS} days.</p>`,
      text: `Hello ${customer.firstName},\n\n${tenant.name} has invited you to their customer portal. Activate your account:\n${inviteLink}\n\nThis link expires in ${INVITATION_TTL_DAYS} days.`,
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "customer.portal_invited",
      entityType: "Customer",
      entityId: customerId,
      metadata: { email, emailSent: emailResult.success },
    });

    return { invited: true, email, expiresAt, emailSent: emailResult.success, inviteLink };
  }

  /**
   * Cancels a pending invitation, or disables an already-activated portal
   * account (clearing its password and revoking every active session) —
   * whichever state the customer is currently in.
   */
  async revoke(
    tenantId: string,
    customerId: string,
    actorUserId: string,
  ): Promise<{ revoked: true }> {
    await this.customersService.findOne(tenantId, customerId);

    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: {
          portalInvitationTokenHash: null,
          portalInvitationExpiresAt: null,
          portalActivatedAt: null,
          portalPasswordHash: null,
        },
      });
      await tx.customerRefreshToken.updateMany({
        where: { customerId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "customer.portal_access_revoked",
      entityType: "Customer",
      entityId: customerId,
    });

    return { revoked: true };
  }

  async status(tenantId: string, customerId: string): Promise<PortalAccessStatus> {
    const customer = await this.customersService.findOne(tenantId, customerId);
    return {
      invited: !!customer.portalInvitedAt,
      activated: !!customer.portalActivatedAt,
      invitedAt: customer.portalInvitedAt,
      activatedAt: customer.portalActivatedAt,
      lastLoginAt: customer.portalLastLoginAt,
      invitationExpired: customer.portalInvitationExpiresAt
        ? customer.portalInvitationExpiresAt < new Date()
        : null,
    };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
