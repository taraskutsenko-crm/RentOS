import { createHash, randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  DocumentSignatureEvidence,
  SignatureSignerType,
  SignatureSource,
} from "@prisma/client";

import { AuditService } from "../../audit/audit.service";
import { CompanySignatureService } from "../../company-signature/company-signature.service";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService, type UploadedFileLike } from "../../storage/storage.service";
import type { DocumentDetailView } from "../document.types";
import { DocumentsService } from "../documents.service";
import { DocumentPdfService } from "../rendering/document-pdf.service";
import type { CaptureDocumentSignatureDto } from "./dto/capture-document-signature.dto";

/** A document with signature evidence already captured on it is final — no more signing evidence can be added or changed. */
const TERMINAL_STATUSES = ["SIGNED", "REJECTED", "VOIDED", "ARCHIVED"];

export interface CaptureSignatureContext {
  /** Staff member who captured this signature — null for a customer's own portal action. */
  actorUserId: string | null;
  /** Set when signerType is CUSTOMER — used for portal-side ownership scoping. */
  customerId: string | null;
  source: SignatureSource;
}

export interface CaptureSignatureResult {
  evidence: DocumentSignatureEvidence;
  document: DocumentDetailView;
}

/**
 * Havelio Signature System (docs/PRODUCT_BIBLE.md) — captures the
 * immutable per-document signature evidence snapshot (see
 * DocumentSignatureEvidence's own schema comment) and drives the existing
 * Document status machine (DocumentsService.sign) so the document actually
 * becomes PARTIALLY_SIGNED/SIGNED as evidence accumulates. Reused by both
 * the staff-facing controller (company signature + in-person customer
 * signature on a staff device) and the customer-portal controller (a
 * customer's own remote signature) — only `ctx` differs between callers.
 *
 * This is a plain visual handwritten signature (drawn/uploaded/reused from
 * the tenant's saved one), never a qualified electronic signature.
 */
@Injectable()
export class DocumentSignatureEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
    private readonly companySignatureService: CompanySignatureService,
    private readonly documentsService: DocumentsService,
    private readonly documentPdfService: DocumentPdfService,
  ) {}

  async list(tenantId: string, documentId: string): Promise<DocumentSignatureEvidence[]> {
    await this.documentsService.findOneRaw(tenantId, documentId);
    return this.prisma.documentSignatureEvidence.findMany({
      where: { tenantId, documentId },
      orderBy: { createdAt: "asc" },
    });
  }

  async readFile(
    tenantId: string,
    documentId: string,
    evidenceId: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const evidence = await this.findEvidenceOrThrow(tenantId, documentId, evidenceId);
    const buffer = await this.storageService.read(evidence.storageKey);
    return { buffer, mimeType: evidence.mimeType };
  }

  async capture(
    tenantId: string,
    documentId: string,
    dto: CaptureDocumentSignatureDto,
    file: UploadedFileLike | undefined,
    ctx: CaptureSignatureContext,
  ): Promise<CaptureSignatureResult> {
    const document = await this.documentsService.findOneRaw(tenantId, documentId);
    if (TERMINAL_STATUSES.includes(document.status)) {
      throw new ConflictException(
        `Cannot capture a signature on a ${document.status} document — its signature evidence is final`,
      );
    }

    const existing = await this.prisma.documentSignatureEvidence.findFirst({
      where: { tenantId, documentId, signerType: dto.signerType },
    });
    if (existing) {
      throw new ConflictException(
        dto.signerType === "TENANT_REPRESENTATIVE"
          ? "This document already has a company signature — signature evidence is immutable once captured"
          : "This document already has a customer signature — signature evidence is immutable once captured",
      );
    }

    const currentVersion = document.versions.find(
      (v) => v.versionNumber === document.currentVersionNumber,
    );
    if (!currentVersion) {
      throw new NotFoundException("Current document version not found");
    }

    let sourceBuffer: Buffer;
    let mimeType: string;
    let resolvedSource: SignatureSource = ctx.source;

    if (dto.method === "STORED_SIGNATURE") {
      if (dto.signerType !== "TENANT_REPRESENTATIVE") {
        throw new BadRequestException(
          "Only a company representative signature can reuse the saved company signature",
        );
      }
      const stored = await this.companySignatureService.findActive(tenantId);
      if (!stored) {
        throw new NotFoundException("No company signature is configured");
      }
      sourceBuffer = await this.storageService.read(stored.storageKey);
      mimeType = stored.mimeType;
      resolvedSource = "COMPANY_PROFILE";
    } else {
      if (!file) {
        throw new BadRequestException("A signature image file is required for this method");
      }
      this.storageService.validateImage(file);
      sourceBuffer = file.buffer;
      mimeType = file.mimetype;
    }

    const storageKey = this.buildKey(tenantId, documentId, dto.signerType);
    await this.storageService.store(storageKey, {
      buffer: sourceBuffer,
      mimetype: mimeType,
      originalname: `${dto.signerType.toLowerCase()}-signature`,
      size: sourceBuffer.length,
    });
    const checksumSha256 = createHash("sha256").update(sourceBuffer).digest("hex");

    const evidence = await this.prisma.$transaction(async (tx) => {
      const created = await tx.documentSignatureEvidence.create({
        data: {
          tenantId,
          documentId,
          documentVersionId: currentVersion.id,
          signerType: dto.signerType,
          signerName: dto.signerName,
          signerTitle: dto.signerTitle ?? null,
          signerEmail: dto.signerEmail ?? null,
          method: dto.method,
          source: resolvedSource,
          storageKey,
          mimeType,
          sizeBytes: sourceBuffer.length,
          checksumSha256,
          capturedByUserId: ctx.actorUserId,
          // For a staff-facilitated in-person customer signature, ctx
          // never carries a customerId (the staff controller doesn't
          // scope by customer) — fall back to the document's own linked
          // customer so portal-side ownership queries still find it.
          customerId:
            dto.signerType === "CUSTOMER" ? (ctx.customerId ?? document.customerId) : null,
        },
      });

      await this.auditService.log(
        {
          tenantId,
          userId: ctx.actorUserId,
          action: "document.signature_captured",
          entityType: "Document",
          entityId: documentId,
          metadata: {
            evidenceId: created.id,
            signerType: dto.signerType,
            signerName: dto.signerName,
            method: dto.method,
            source: resolvedSource,
          },
        },
        tx,
      );

      return created;
    });

    const evidenceRows = await this.prisma.documentSignatureEvidence.findMany({
      where: { tenantId, documentId },
      select: { signerType: true },
    });
    const hasCompanySignature = evidenceRows.some(
      (row) => row.signerType === "TENANT_REPRESENTATIVE",
    );
    const hasCustomerSignature = evidenceRows.some((row) => row.signerType === "CUSTOMER");
    const fullySigned = hasCompanySignature && hasCustomerSignature;

    // We already rejected TERMINAL_STATUSES above, so every remaining
    // status has a valid PARTIALLY_SIGNED/SIGNED transition (see
    // ALLOWED_TRANSITIONS in documents.service.ts) — this is always safe
    // to call, and a no-op if the document is already at the target status
    // (e.g. capturing the second signature when the first already moved it
    // to PARTIALLY_SIGNED and this one now makes it fully SIGNED).
    let updatedDocument = await this.documentsService.sign(
      tenantId,
      documentId,
      ctx.actorUserId,
      fullySigned,
      {},
    );

    if (fullySigned) {
      // The final signed PDF must actually contain both signature images —
      // force a fresh render now rather than waiting for the next GET
      // .../pdf, which would otherwise keep serving the pre-signature
      // cached render (see DocumentPdfService's own doc comment).
      const finalVersion = updatedDocument.versions.find(
        (v) => v.versionNumber === updatedDocument.currentVersionNumber,
      )!;
      const { file: pdfFile } = await this.documentPdfService.generateAndStore(
        tenantId,
        updatedDocument,
        finalVersion,
        ctx.actorUserId,
      );
      await this.documentsService.recordRender(tenantId, documentId, ctx.actorUserId, pdfFile.id);
      updatedDocument = await this.documentsService.findOne(tenantId, documentId);
    }

    return { evidence, document: updatedDocument };
  }

  private async findEvidenceOrThrow(
    tenantId: string,
    documentId: string,
    evidenceId: string,
  ): Promise<DocumentSignatureEvidence> {
    const evidence = await this.prisma.documentSignatureEvidence.findFirst({
      where: { id: evidenceId, tenantId, documentId },
    });
    if (!evidence) {
      throw new NotFoundException("Signature not found");
    }
    return evidence;
  }

  private buildKey(tenantId: string, documentId: string, signerType: SignatureSignerType): string {
    return `tenants/${tenantId}/documents/${documentId}/signatures/${randomUUID()}-${signerType.toLowerCase()}.png`;
  }
}
