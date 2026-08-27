import { BadRequestException, Injectable } from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import type { SendInvoiceEmailDto } from "./dto/send-invoice-email.dto";
import { InvoicesService } from "./invoices.service";
import { InvoicePdfService } from "./rendering/invoice-pdf.service";

export interface InvoiceEmailResult {
  sent: boolean;
  error?: string;
}

/**
 * Invoice previously had no email-sending action at all — only `markSent`,
 * a manual status flip with nothing actually dispatched (see
 * InvoicesService.markSent, `Invoice.sentAt`). This is the first version
 * that actually emails anything. `markSent`/`Invoice.status`/`sentAt` stay
 * completely untouched by this service — email delivery is tracked
 * independently in `InvoiceEmailDelivery`, the same separation
 * Document/Quote keep between their own lifecycle status and email
 * delivery truthfulness (see DECISIONS.md production-infrastructure pass).
 *
 * Mirrors DocumentEmailService's isConfigured()-first pattern exactly (see
 * D-093): when no real EmailProvider is configured, this never claims
 * SENT and never even attempts a wasted send — it persists NOT_CONFIGURED
 * and returns immediately.
 */
@Injectable()
export class InvoiceEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
    private readonly invoicesService: InvoicesService,
    private readonly invoicePdfService: InvoicePdfService,
  ) {}

  async send(
    tenantId: string,
    invoiceId: string,
    actorUserId: string,
    dto: SendInvoiceEmailDto,
  ): Promise<InvoiceEmailResult> {
    const invoice = await this.invoicesService.findOne(tenantId, invoiceId);

    const recipientEmail =
      dto.recipientEmail || (invoice.buyerSnapshot.email as string | undefined);
    if (!recipientEmail) {
      throw new BadRequestException(
        "This invoice's customer has no email on file — provide recipientEmail explicitly",
      );
    }

    const subject =
      dto.subject ||
      `Invoice ${invoice.invoiceNumber} from ${String(invoice.sellerSnapshot.name ?? "")}`;

    if (!this.emailService.isConfigured()) {
      await this.prisma.invoiceEmailDelivery.create({
        data: {
          tenantId,
          invoiceId,
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
        action: "invoice.email_not_configured",
        entityType: "Invoice",
        entityId: invoiceId,
        metadata: { recipientEmail },
      });
      return { sent: false, error: "No email provider is configured" };
    }

    const pdfBuffer = await this.invoicePdfService.render(invoice);
    const result = await this.emailService.send({
      to: recipientEmail,
      subject,
      html: buildInvoiceEmailHtml(invoice.invoiceNumber, dto.message),
      attachments: [
        {
          filename: `${invoice.invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    await this.prisma.invoiceEmailDelivery.create({
      data: {
        tenantId,
        invoiceId,
        recipientEmail,
        subject,
        message: dto.message ?? null,
        status: result.success ? "SENT" : "FAILED",
        errorMessage: result.error ?? null,
        providerMessageId: result.messageId ?? null,
        sentByUserId: actorUserId,
        sentAt: result.success ? new Date() : null,
        failedAt: result.success ? null : new Date(),
      },
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: result.success ? "invoice.email_sent" : "invoice.email_failed",
      entityType: "Invoice",
      entityId: invoiceId,
      metadata: { recipientEmail, ...(result.error ? { error: result.error } : {}) },
    });

    return { sent: result.success, ...(result.error ? { error: result.error } : {}) };
  }

  /** Every email-send attempt for this invoice, newest first. */
  async findDeliveries(tenantId: string, invoiceId: string) {
    await this.invoicesService.findOne(tenantId, invoiceId); // 404s if not this tenant's
    return this.prisma.invoiceEmailDelivery.findMany({
      where: { tenantId, invoiceId },
      orderBy: { createdAt: "desc" },
    });
  }
}

function buildInvoiceEmailHtml(invoiceNumber: string, message: string | undefined): string {
  const escapedMessage = message ? `<p>${escapeHtml(message).replace(/\n/g, "<br />")}</p>` : "";
  return `<p>Please find invoice <strong>${escapeHtml(invoiceNumber)}</strong> attached.</p>${escapedMessage}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
