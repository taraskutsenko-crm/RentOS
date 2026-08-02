import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { DocumentSignatureRequest } from "@prisma/client";

import { AuditService } from "../../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import { DocumentsService } from "../documents.service";
import type { RequestDocumentSignatureDto } from "../dto/request-document-signature.dto";
import { DocumentPdfService } from "../rendering/document-pdf.service";
import {
  DOCUMENT_SIGNATURE_PROVIDER,
  type DocumentSignatureProvider,
} from "./document-signature-provider.types";

const OPEN_STATUSES = ["REQUESTED", "PENDING"] as const;

/**
 * Orchestrates e-signature requests through whichever
 * DocumentSignatureProvider is bound (LocalMockProvider only, in Part 2).
 * Deliberately decoupled from Document.status: a DocumentSignatureRequest
 * tracks the external signature workflow's own state
 * (REQUESTED/PENDING/SIGNED/REJECTED/EXPIRED/CANCELLED), while the
 * Document's coarse business-lifecycle status still transitions only
 * through DocumentsService.sign/reject — staff confirm the actual outcome
 * there once a signature is obtained by whatever means (no real provider
 * exists yet to auto-drive that transition via a webhook). See
 * docs/adr/0011-document-rendering-and-sharing.md.
 */
@Injectable()
export class DocumentSignatureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly documentsService: DocumentsService,
    private readonly pdfService: DocumentPdfService,
    @Inject(DOCUMENT_SIGNATURE_PROVIDER) private readonly provider: DocumentSignatureProvider,
  ) {}

  async request(
    tenantId: string,
    documentId: string,
    actorUserId: string,
    dto: RequestDocumentSignatureDto,
  ): Promise<DocumentSignatureRequest> {
    const document = await this.documentsService.findOneRaw(tenantId, documentId);
    const version = document.versions.find(
      (v) => v.versionNumber === document.currentVersionNumber,
    )!;

    const { buffer } = await this.pdfService.getOrGenerate(tenantId, document, version);
    const result = await this.provider.requestSignature({
      documentNumber: document.documentNumber,
      signerName: dto.signerName ?? null,
      signerEmail: dto.signerEmail ?? document.customer?.email ?? null,
      pdfBuffer: buffer,
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const request = await tx.documentSignatureRequest.create({
        data: {
          tenantId,
          documentId,
          documentVersionId: version.id,
          provider: "LOCAL_MOCK",
          status: result.status,
          signerName: dto.signerName ?? null,
          signerEmail: dto.signerEmail ?? document.customer?.email ?? null,
          externalReference: result.externalReference,
          requestedByUserId: actorUserId,
        },
      });

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "document.signature_requested",
          entityType: "Document",
          entityId: documentId,
          metadata: { signatureRequestId: request.id, provider: "LOCAL_MOCK" },
        },
        tx,
      );

      return request;
    });

    return created;
  }

  async findMany(tenantId: string, documentId: string): Promise<DocumentSignatureRequest[]> {
    return this.prisma.documentSignatureRequest.findMany({
      where: { tenantId, documentId },
      orderBy: { requestedAt: "desc" },
    });
  }

  /** Polls the provider and persists whatever it currently reports — a no-op status change for LocalMockProvider (always PENDING). */
  async refreshStatus(
    tenantId: string,
    documentId: string,
    signatureRequestId: string,
    actorUserId: string,
  ): Promise<DocumentSignatureRequest> {
    const current = await this.findOrThrow(tenantId, documentId, signatureRequestId);
    const result = await this.provider.checkStatus(current.externalReference);
    return this.updateStatus(current, result.status, actorUserId);
  }

  async cancel(
    tenantId: string,
    documentId: string,
    signatureRequestId: string,
    actorUserId: string,
  ): Promise<DocumentSignatureRequest> {
    const current = await this.findOrThrow(tenantId, documentId, signatureRequestId);
    if (!OPEN_STATUSES.includes(current.status as (typeof OPEN_STATUSES)[number])) {
      throw new ConflictException(`Cannot cancel a signature request in ${current.status} status`);
    }
    await this.provider.cancel(current.externalReference);
    return this.updateStatus(current, "CANCELLED", actorUserId);
  }

  /**
   * The customer-portal completion action (TASK-0009) — the customer
   * clicking "Sign" in their own portal IS the real-world signing event
   * for LOCAL_MOCK, so this is the one place Part 2's deliberately-deferred
   * DocumentSignatureRequest/Document.status bridge (see this class's own
   * doc comment and ADR 0011) is actually wired: it both completes the
   * signature request AND advances the parent Document to SIGNED, since a
   * customer action (unlike a staff-side refreshStatus poll) is a genuine,
   * authenticated confirmation of the outcome, not a status check.
   */
  async customerSign(
    tenantId: string,
    documentId: string,
    signatureRequestId: string,
    customerId: string,
  ): Promise<DocumentSignatureRequest> {
    const current = await this.findOrThrow(tenantId, documentId, signatureRequestId);
    if (!OPEN_STATUSES.includes(current.status as (typeof OPEN_STATUSES)[number])) {
      throw new ConflictException(`Cannot sign a signature request in ${current.status} status`);
    }

    // Advance the Document first — changeStatus validates the transition
    // and throws before writing anything if it's invalid. Only once that
    // has genuinely succeeded (or was already a no-op) do we mark the
    // signature request itself SIGNED, so a rejected transition never
    // leaves the two records in an inconsistent state.
    await this.documentsService.sign(tenantId, documentId, null, true, {});

    const updated = await this.prisma.documentSignatureRequest.update({
      where: { id: current.id },
      data: { status: "SIGNED", respondedAt: new Date() },
    });

    await this.auditService.log({
      tenantId,
      userId: null,
      action: "document.signature_status_changed",
      entityType: "Document",
      entityId: documentId,
      metadata: { signatureRequestId: current.id, from: current.status, to: "SIGNED", customerId },
    });

    return updated;
  }

  private async findOrThrow(
    tenantId: string,
    documentId: string,
    signatureRequestId: string,
  ): Promise<DocumentSignatureRequest> {
    const request = await this.prisma.documentSignatureRequest.findFirst({
      where: { id: signatureRequestId, tenantId, documentId },
    });
    if (!request) {
      throw new NotFoundException("Signature request not found");
    }
    return request;
  }

  private async updateStatus(
    current: DocumentSignatureRequest,
    status: DocumentSignatureRequest["status"],
    actorUserId: string,
  ): Promise<DocumentSignatureRequest> {
    if (current.status === status) {
      return current;
    }
    const isTerminal = !OPEN_STATUSES.includes(status as (typeof OPEN_STATUSES)[number]);
    const updated = await this.prisma.documentSignatureRequest.update({
      where: { id: current.id },
      data: { status, respondedAt: isTerminal ? new Date() : current.respondedAt },
    });
    await this.auditService.log({
      tenantId: current.tenantId,
      userId: actorUserId,
      action: "document.signature_status_changed",
      entityType: "Document",
      entityId: current.documentId,
      metadata: { signatureRequestId: current.id, from: current.status, to: status },
    });
    return updated;
  }
}
