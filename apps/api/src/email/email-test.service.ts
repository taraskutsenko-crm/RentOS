import { ConflictException, Injectable } from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { buildLogoEmailParts } from "./email-logo.util";
import { EmailService } from "./email.service";
import type { EmailSendResult } from "./email.types";
import { buildTenantFromName, resolveTenantReplyTo } from "./tenant-sender-identity.util";

/**
 * Task B4/B5: a real end-to-end proof that the environment's configured
 * SMTP provider can actually deliver mail — sent through the exact same
 * EmailService/EmailProvider every other transactional email in this
 * codebase uses (DocumentEmailService, QuotesService, InvoiceEmailService),
 * never a parallel mail path. Uses the tenant's own sender identity
 * (From display name, Reply-To, logo) so what staff sees in their test
 * inbox matches what a real customer-facing email from this tenant would
 * look like.
 *
 * Deliberately stateless — no delivery-history row is persisted for a test
 * send (unlike DocumentEmailDelivery/InvoiceEmailDelivery, which back a
 * real customer-facing record); an audit log entry is enough for
 * traceability without a new schema addition (see DECISIONS.md
 * "don't overengineer").
 */
@Injectable()
export class EmailTestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
  ) {}

  async sendTest(
    tenantId: string,
    recipientEmail: string,
    actorUserId: string,
  ): Promise<EmailSendResult> {
    if (!this.emailService.isConfigured()) {
      // A precondition failure, not a send attempt — the UI's own status
      // card already gates this action on `configured`, so reaching here
      // means either a stale UI or a direct API call; either way, never
      // silently report an untried send as failed.
      throw new ConflictException(
        "No real email provider is configured in this environment — nothing to test.",
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, email: true, timezone: true, logoStorageKey: true, logoMimeType: true },
    });
    const logoParts = buildLogoEmailParts(await this.readLogo(tenant));
    const replyTo = resolveTenantReplyTo(tenant?.email);

    const result = await this.emailService.send({
      to: recipientEmail,
      subject: "Havelio — Email configuration test",
      html: buildTestEmailHtml(tenant?.name ?? null, tenant?.timezone ?? "UTC", logoParts.imgHtml),
      text: buildTestEmailText(tenant?.name ?? null, tenant?.timezone ?? "UTC"),
      fromName: buildTenantFromName(tenant?.name),
      ...(replyTo ? { replyTo } : {}),
      attachments: logoParts.attachments,
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: result.success ? "integration.email_test_sent" : "integration.email_test_failed",
      entityType: "Tenant",
      entityId: tenantId,
      metadata: { recipientEmail, error: result.success ? null : result.error },
    });

    // Never return the transport messageId or any other provider-internal
    // detail to the frontend beyond success/error — see EmailStatusView's
    // own "never expose secrets/internals" rule.
    return result.success
      ? { success: true }
      : { success: false, ...(result.error ? { error: result.error } : {}) };
  }

  private async readLogo(
    tenant: { logoStorageKey: string | null; logoMimeType: string | null } | null,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    if (!tenant?.logoStorageKey || !tenant.logoMimeType) return null;
    try {
      const buffer = await this.storageService.read(tenant.logoStorageKey);
      return { buffer, mimeType: tenant.logoMimeType };
    } catch {
      return null;
    }
  }
}

function formatTenantLocalDateTime(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: timezone,
  }).format(value);
}

function buildTestEmailText(tenantName: string | null, timezone: string): string {
  const sentAt = formatTenantLocalDateTime(new Date(), timezone);
  return [
    "Your Havelio email configuration is working correctly.",
    "",
    `Company: ${tenantName ?? "—"}`,
    `Sent: ${sentAt}`,
    "",
    "This is a test message. No action is required.",
  ].join("\n");
}

function buildTestEmailHtml(
  tenantName: string | null,
  timezone: string,
  logoImgHtml: string,
): string {
  const sentAt = formatTenantLocalDateTime(new Date(), timezone);
  return `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
      ${logoImgHtml}
      <h2>Havelio — Email configuration test</h2>
      <p>Your Havelio email configuration is working correctly.</p>
      <p><strong>Company:</strong> ${escapeHtml(tenantName ?? "—")}<br/>
      <strong>Sent:</strong> ${escapeHtml(sentAt)}</p>
      <p style="color:#888;">This is a test message. No action is required.</p>
      <p style="color:#aaa; font-size: 11px; margin-top: 24px;">Sent via Havelio</p>
    </div>
  `.trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
