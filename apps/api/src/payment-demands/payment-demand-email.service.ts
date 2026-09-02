import { BadRequestException, Injectable } from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { buildLogoEmailParts } from "../email/email-logo.util";
import { EmailService } from "../email/email.service";
import { buildTenantFromName, resolveTenantReplyTo } from "../email/tenant-sender-identity.util";
import { PrismaService } from "../prisma/prisma.service";
import type { SendPaymentDemandEmailDto } from "./dto/send-payment-demand-email.dto";
import { PaymentDemandsService } from "./payment-demands.service";
import { PaymentDemandPdfService } from "./rendering/payment-demand-pdf.service";

export interface PaymentDemandEmailResult {
  sent: boolean;
  error?: string;
}

/**
 * Mirrors InvoiceEmailService exactly (see that file's own doc comment for
 * the isConfigured()-first / truthful-delivery-status rationale — D-093).
 * `PaymentDemand.status`/`sentAt` are updated on the FIRST successful send
 * only (a demand is never re-generated, only re-sent) — email delivery
 * itself is tracked independently in `PaymentDemandEmailDelivery`.
 */
@Injectable()
export class PaymentDemandEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
    private readonly paymentDemandsService: PaymentDemandsService,
    private readonly pdfService: PaymentDemandPdfService,
  ) {}

  async send(
    tenantId: string,
    paymentDemandId: string,
    actorUserId: string,
    dto: SendPaymentDemandEmailDto,
  ): Promise<PaymentDemandEmailResult> {
    const demand = await this.paymentDemandsService.findOne(tenantId, paymentDemandId);

    const recipientEmail =
      dto.recipientEmail || (demand.debtorSnapshot.email as string | undefined);
    if (!recipientEmail) {
      throw new BadRequestException(
        "This customer has no email on file — provide recipientEmail explicitly",
      );
    }

    const subject =
      dto.subject ||
      `${demand.demandNumber} — ${String(demand.creditorSnapshot.name ?? "")}`;

    if (!this.emailService.isConfigured()) {
      await this.prisma.paymentDemandEmailDelivery.create({
        data: {
          tenantId,
          paymentDemandId,
          recipientEmail,
          subject,
          message: dto.message ?? null,
          status: "NOT_CONFIGURED",
          errorMessage: "No email provider is configured",
          sentByUserId: actorUserId,
        },
      });
      await this.auditService.log({
        tenantId,
        userId: actorUserId,
        action: "payment_demand.email_not_configured",
        entityType: "PaymentDemand",
        entityId: paymentDemandId,
        metadata: { recipientEmail },
      });
      return { sent: false, error: "No email provider is configured" };
    }

    const pdfBuffer = await this.pdfService.render(demand);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, email: true },
    });
    const replyTo = resolveTenantReplyTo(tenant?.email);
    // Same frozen creditorSnapshot logo the attached PDF itself renders —
    // never a live re-read, matching InvoiceEmailService's identical
    // convention (see that file's own doc comment).
    const snapshotLogoBase64 = demand.creditorSnapshot.logoBase64 as string | undefined;
    const snapshotLogoMimeType = demand.creditorSnapshot.logoMimeType as string | undefined;
    const logoParts = buildLogoEmailParts(
      snapshotLogoBase64 && snapshotLogoMimeType
        ? { buffer: Buffer.from(snapshotLogoBase64, "base64"), mimeType: snapshotLogoMimeType }
        : null,
    );

    const result = await this.emailService.send({
      to: recipientEmail,
      subject,
      html: buildPaymentDemandEmailHtml(
        demand.demandNumber,
        dto.message,
        tenant?.name ?? null,
        logoParts.imgHtml,
      ),
      fromName: buildTenantFromName(tenant?.name),
      ...(replyTo ? { replyTo } : {}),
      attachments: [
        {
          filename: `${demand.demandNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
        ...logoParts.attachments,
      ],
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentDemandEmailDelivery.create({
        data: {
          tenantId,
          paymentDemandId,
          recipientEmail,
          subject,
          message: dto.message ?? null,
          status: result.success ? "SENT" : "FAILED",
          errorMessage: result.error ?? null,
          errorCategory: result.success ? null : (result.errorCategory ?? "PROVIDER_ERROR"),
          providerMessageId: result.messageId ?? null,
          sentByUserId: actorUserId,
          sentAt: result.success ? new Date() : null,
          failedAt: result.success ? null : new Date(),
        },
      });
      if (result.success) {
        await tx.paymentDemand.updateMany({
          where: { id: paymentDemandId, tenantId, status: "GENERATED" },
          data: { status: "SENT", sentAt: new Date() },
        });
      }
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: result.success ? "payment_demand.email_sent" : "payment_demand.email_failed",
      entityType: "PaymentDemand",
      entityId: paymentDemandId,
      metadata: { recipientEmail, ...(result.error ? { error: result.error } : {}) },
    });

    return { sent: result.success, ...(result.error ? { error: result.error } : {}) };
  }

  /** Every email-send attempt for this demand, newest first. */
  async findDeliveries(tenantId: string, paymentDemandId: string) {
    await this.paymentDemandsService.findOne(tenantId, paymentDemandId); // 404s if not this tenant's
    return this.prisma.paymentDemandEmailDelivery.findMany({
      where: { tenantId, paymentDemandId },
      orderBy: { createdAt: "desc" },
    });
  }
}

function buildPaymentDemandEmailHtml(
  demandNumber: string,
  message: string | undefined,
  tenantName: string | null,
  logoImgHtml: string,
): string {
  const escapedMessage = message ? `<p>${escapeHtml(message).replace(/\n/g, "<br />")}</p>` : "";
  const heading = tenantName ? `<h2>${escapeHtml(tenantName)}</h2>` : "";
  return `${logoImgHtml}${heading}<p>Please find payment demand <strong>${escapeHtml(demandNumber)}</strong> attached.</p>${escapedMessage}<p style="color:#aaa; font-size: 11px; margin-top: 24px;">Sent via Havelio</p>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
