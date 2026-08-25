import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { DocumentEmailDelivery } from "@prisma/client";

import { AuditService } from "../../audit/audit.service";
import { EmailService } from "../../email/email.service";
import { PrismaService } from "../../prisma/prisma.service";
import { DocumentsService } from "../documents.service";
import type { SendDocumentEmailDto } from "../dto/send-document-email.dto";
import { DocumentPdfService } from "../rendering/document-pdf.service";

/**
 * Sends a Document's current-version PDF by email — "Part 5: Email
 * Delivery". Reuses EmailService/EmailProvider as-is (see ADR 0007's
 * swappable-adapter pattern, unmodified here); no new transport code.
 *
 * Synchronous by design, matching the task's explicit "no background jobs
 * yet" instruction and QuotesService.send's identical existing convention
 * (the SMTP/API call happens after all database writes, never inside a
 * `$transaction`). The seam for a future queue is `dispatch` below: moving
 * to a queue means replacing that one method's body with "enqueue a job
 * that eventually calls it," with the DocumentEmailDelivery row (created
 * synchronously, status PENDING) already serving as the durable, retryable
 * record a queue consumer would need — no schema change required to add a
 * queue later.
 */
@Injectable()
export class DocumentEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly documentsService: DocumentsService,
    private readonly pdfService: DocumentPdfService,
    private readonly emailService: EmailService,
  ) {}

  async send(
    tenantId: string,
    documentId: string,
    actorUserId: string,
    dto: SendDocumentEmailDto,
  ): Promise<DocumentEmailDelivery> {
    const document = await this.documentsService.findOneRaw(tenantId, documentId);
    const version = document.versions.find(
      (v) => v.versionNumber === document.currentVersionNumber,
    )!;
    const recipientEmail = await this.resolveRecipientEmail(tenantId, document, dto);

    const delivery = await this.prisma.documentEmailDelivery.create({
      data: {
        tenantId,
        documentId,
        documentVersionId: version.id,
        recipientType: dto.recipientType,
        recipientEmail,
        subject: dto.subject,
        message: dto.message ?? null,
        status: "PENDING",
        sentByUserId: actorUserId,
      },
    });

    return this.dispatch(tenantId, document, version, delivery, actorUserId);
  }

  /** Re-sends using the same recipient/subject/message as a previous attempt — creates a fresh delivery row, never mutates the original. */
  async retry(
    tenantId: string,
    documentId: string,
    emailDeliveryId: string,
    actorUserId: string,
  ): Promise<DocumentEmailDelivery> {
    const original = await this.prisma.documentEmailDelivery.findFirst({
      where: { id: emailDeliveryId, tenantId, documentId },
    });
    if (!original) {
      throw new NotFoundException("Email delivery not found");
    }

    return this.send(tenantId, documentId, actorUserId, {
      recipientType: original.recipientType,
      subject: original.subject,
      message: original.message,
      ...(original.recipientType === "CUSTOM" ? { customEmail: original.recipientEmail } : {}),
    });
  }

  async findMany(tenantId: string, documentId: string): Promise<DocumentEmailDelivery[]> {
    return this.prisma.documentEmailDelivery.findMany({
      where: { tenantId, documentId },
      orderBy: { createdAt: "desc" },
    });
  }

  /** The queue-replaceable seam — see this service's class-level doc comment. */
  private async dispatch(
    tenantId: string,
    document: Awaited<ReturnType<DocumentsService["findOneRaw"]>>,
    version: (typeof document)["versions"][number],
    delivery: DocumentEmailDelivery,
    actorUserId: string,
  ): Promise<DocumentEmailDelivery> {
    // No real email transport exists in this environment (see
    // LoggingEmailProvider) — never claim "Sent" for a message that was
    // never actually attempted. Skips PDF generation too, since there is
    // nothing to attach it to (see DECISIONS.md, email truthfulness fix).
    if (!this.emailService.isConfigured()) {
      const notConfigured = await this.prisma.documentEmailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "NOT_CONFIGURED",
          errorMessage: "No real email provider is configured in this environment.",
          sentAt: null,
        },
      });

      await this.auditService.log({
        tenantId,
        userId: actorUserId,
        action: "document.email_not_configured",
        entityType: "Document",
        entityId: document.id,
        metadata: { emailDeliveryId: delivery.id, recipientEmail: delivery.recipientEmail },
      });

      return notConfigured;
    }

    const { buffer } = await this.pdfService.getOrGenerate(tenantId, document, version);

    const result = await this.emailService.send({
      to: delivery.recipientEmail,
      subject: delivery.subject,
      html: buildEmailHtml(document.documentNumber, delivery.message),
      attachments: [
        {
          filename: `${document.documentNumber}.pdf`,
          content: buffer,
          contentType: "application/pdf",
        },
      ],
    });

    const updated = await this.prisma.documentEmailDelivery.update({
      where: { id: delivery.id },
      data: {
        status: result.success ? "SENT" : "FAILED",
        errorMessage: result.success ? null : (result.error ?? "Unknown error"),
        sentAt: result.success ? new Date() : null,
      },
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: result.success ? "document.email_sent" : "document.email_failed",
      entityType: "Document",
      entityId: document.id,
      metadata: {
        emailDeliveryId: delivery.id,
        recipientEmail: delivery.recipientEmail,
        error: result.success ? null : result.error,
      },
    });

    return updated;
  }

  private async resolveRecipientEmail(
    tenantId: string,
    document: Awaited<ReturnType<DocumentsService["findOneRaw"]>>,
    dto: SendDocumentEmailDto,
  ): Promise<string> {
    if (dto.recipientType === "CUSTOM") {
      if (!dto.customEmail) {
        throw new BadRequestException("customEmail is required when recipientType is CUSTOM");
      }
      return dto.customEmail;
    }

    if (dto.recipientType === "CUSTOMER") {
      if (!document.customer?.email) {
        throw new BadRequestException("This document has no customer email on file");
      }
      return document.customer.email;
    }

    // EMPLOYEE
    if (!document.employeeUserId) {
      throw new BadRequestException("This document has no employee assigned");
    }
    const employee = await this.prisma.user.findUnique({
      where: { id: document.employeeUserId },
      select: { email: true },
    });
    if (!employee) {
      throw new BadRequestException("Assigned employee not found");
    }
    return employee.email;
  }
}

function buildEmailHtml(documentNumber: string, message: string | null): string {
  const escapedMessage = message ? `<p>${escapeHtml(message)}</p>` : "";
  return `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
      <p>Please find attached document <strong>${escapeHtml(documentNumber)}</strong>.</p>
      ${escapedMessage}
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
