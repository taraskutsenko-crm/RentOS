import { Injectable, NotFoundException } from "@nestjs/common";
import archiver from "archiver";
import type { DocumentSignatureRequest } from "@prisma/client";

import type { PaginatedResult } from "../../customers/customers.service";
import type { DocumentDetailView, DocumentListItemView } from "../../documents/document.types";
import { DocumentsService } from "../../documents/documents.service";
import type { RenderedHtml } from "../../documents/rendering/document-renderer.service";
import { DocumentRendererService } from "../../documents/rendering/document-renderer.service";
import {
  DocumentPdfService,
  type GeneratedDocumentPdf,
} from "../../documents/rendering/document-pdf.service";
import { DocumentSignatureService } from "../../documents/signature/document-signature.service";
import type { QueryPortalDocumentsDto } from "../dto/query-portal-documents.dto";

export interface GeneratedRentalDocumentsZip {
  buffer: Buffer;
  fileName: string;
}

/**
 * Read-mostly wrapper around the Document Platform (ADR 0010/0011) for the
 * customer portal — every method enforces `document.customerId ===
 * customerId` on top of DocumentsService's tenant-only scoping, the same
 * ownership-check pattern PortalRentalsService already established. The
 * only *write* action here is `sign()`, which delegates entirely to
 * DocumentSignatureService.customerSign() — no signature/PDF/rendering
 * logic is duplicated.
 */
@Injectable()
export class PortalDocumentsService {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly documentRenderer: DocumentRendererService,
    private readonly documentPdfService: DocumentPdfService,
    private readonly documentSignatureService: DocumentSignatureService,
  ) {}

  async findMany(
    tenantId: string,
    customerId: string,
    query: QueryPortalDocumentsDto,
  ): Promise<PaginatedResult<DocumentListItemView>> {
    return this.documentsService.findMany(tenantId, { ...query, customerId });
  }

  async findOne(tenantId: string, customerId: string, id: string): Promise<DocumentDetailView> {
    const document = await this.documentsService.findOne(tenantId, id);
    this.assertOwnership(document, customerId);
    return document;
  }

  async preview(tenantId: string, customerId: string, id: string): Promise<RenderedHtml> {
    const document = await this.findOneRawChecked(tenantId, customerId, id);
    const version = this.currentVersion(document);
    await this.documentsService.recordPortalView(tenantId, id);
    return this.documentRenderer.renderHtml(tenantId, document, version);
  }

  async getPdf(tenantId: string, customerId: string, id: string): Promise<GeneratedDocumentPdf> {
    const document = await this.findOneRawChecked(tenantId, customerId, id);
    const version = this.currentVersion(document);
    await this.documentsService.recordPortalView(tenantId, id);
    const generated = await this.documentPdfService.getOrGenerate(tenantId, document, version);
    await this.documentsService.recordDownload(tenantId, id, null, generated.file.id);
    return generated;
  }

  async listSignatureRequests(
    tenantId: string,
    customerId: string,
    id: string,
  ): Promise<DocumentSignatureRequest[]> {
    await this.findOne(tenantId, customerId, id);
    return this.documentSignatureService.findMany(tenantId, id);
  }

  async sign(
    tenantId: string,
    customerId: string,
    id: string,
    signatureRequestId: string,
  ): Promise<DocumentSignatureRequest> {
    await this.findOne(tenantId, customerId, id);
    return this.documentSignatureService.customerSign(tenantId, id, signatureRequestId, customerId);
  }

  /**
   * Bundles the current PDF of every non-deleted document tied to a
   * rental into a single ZIP, generating any missing PDF on the fly.
   * Everything is buffered in memory (StorageService has no streaming
   * interface — see docs/adr/0012-customer-portal.md) which is safe given
   * MAX_DOCUMENT_SIZE_BYTES already bounds each individual file to 20 MB
   * and a rental realistically has a handful of documents, not hundreds.
   */
  async zipRentalDocuments(
    tenantId: string,
    customerId: string,
    rentalId: string,
  ): Promise<GeneratedRentalDocumentsZip> {
    const { items } = await this.documentsService.findMany(tenantId, {
      customerId,
      rentalId,
      pageSize: 100,
    });
    if (items.length === 0) {
      throw new NotFoundException("No documents found for this rental");
    }

    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<void>((resolve, reject) => {
      archive.on("end", () => resolve());
      archive.on("error", (error) => reject(error));
    });

    for (const item of items) {
      const document = await this.documentsService.findOneRaw(tenantId, item.id);
      const version = this.currentVersion(document);
      const generated = await this.documentPdfService.getOrGenerate(tenantId, document, version);
      archive.append(generated.buffer, { name: `${document.documentNumber}.pdf` });
    }

    await archive.finalize();
    await done;

    return { buffer: Buffer.concat(chunks), fileName: `rental-documents-${rentalId}.zip` };
  }

  private async findOneRawChecked(
    tenantId: string,
    customerId: string,
    id: string,
  ): Promise<DocumentDetailView> {
    const document = await this.documentsService.findOneRaw(tenantId, id);
    this.assertOwnership(document, customerId);
    return document;
  }

  private assertOwnership(document: DocumentDetailView, customerId: string): void {
    if (document.customerId !== customerId) {
      throw new NotFoundException("Document not found");
    }
  }

  private currentVersion(document: DocumentDetailView) {
    const version = document.versions.find(
      (v) => v.versionNumber === document.currentVersionNumber,
    );
    if (!version) {
      throw new NotFoundException("Document has no current version");
    }
    return version;
  }
}
