import { createHash, randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type { DocumentFile } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";
import type { DocumentDetailView, DocumentVersionWithFiles } from "../document.types";
import { DocumentRendererService } from "./document-renderer.service";
import { PdfRendererService } from "./pdf-renderer.service";

export interface GeneratedDocumentPdf {
  file: DocumentFile;
  buffer: Buffer;
}

/**
 * Ties DocumentRendererService (HTML) + PdfRendererService (Puppeteer) +
 * StorageService together and persists the result as a `DocumentFile`
 * (format PDF) on the current `DocumentVersion` — mirrors QuotePdfService's
 * generate-and-store / get-latest shape exactly, so `GET .../pdf` serves
 * the most recently generated PDF without regenerating on every request,
 * while `POST .../pdf` (or any explicit "render" action) always forces a
 * fresh one. Never generates or stores HTML itself — see
 * DocumentRendererService's own doc comment for why.
 */
@Injectable()
export class DocumentPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly documentRenderer: DocumentRendererService,
    private readonly pdfRenderer: PdfRendererService,
  ) {}

  async getLatest(documentVersion: DocumentVersionWithFiles): Promise<GeneratedDocumentPdf | null> {
    const existing = documentVersion.files.find((f) => f.format === "PDF");
    if (!existing) return null;
    const buffer = await this.storageService.read(existing.storageKey);
    return { file: existing, buffer };
  }

  async generateAndStore(
    tenantId: string,
    document: DocumentDetailView,
    version: DocumentVersionWithFiles,
    actorUserId: string | null,
  ): Promise<GeneratedDocumentPdf> {
    const { html } = await this.documentRenderer.renderHtml(tenantId, document, version);
    const buffer = await this.pdfRenderer.renderPdf(html);

    const fileName = `${document.documentNumber}.pdf`;
    const storageKey = this.buildKey(tenantId, document.id, version.id, fileName);
    await this.storageService.store(storageKey, {
      buffer,
      mimetype: "application/pdf",
      originalname: fileName,
      size: buffer.length,
    });

    // Tamper-evidence only (docs/PRODUCT_BIBLE.md "Havelio Signature
    // System") — hashed from the exact bytes just written to storageKey,
    // never a separately-regenerated render, so this hash always matches
    // what a later download actually returns.
    const sha256 = createHash("sha256").update(buffer).digest("hex");

    const file = await this.prisma.documentFile.create({
      data: {
        tenantId,
        documentVersionId: version.id,
        format: "PDF",
        storageKey,
        originalFileName: fileName,
        mimeType: "application/pdf",
        sizeBytes: buffer.length,
        sha256,
        uploadedByUserId: actorUserId,
      },
    });

    return { file, buffer };
  }

  /** GET-or-generate — used by the public share download endpoint, which never forces regeneration. */
  async getOrGenerate(
    tenantId: string,
    document: DocumentDetailView,
    version: DocumentVersionWithFiles,
  ): Promise<GeneratedDocumentPdf> {
    const existing = await this.getLatest(version);
    if (existing) return existing;
    return this.generateAndStore(tenantId, document, version, null);
  }

  private buildKey(
    tenantId: string,
    documentId: string,
    documentVersionId: string,
    fileName: string,
  ): string {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
    return `tenants/${tenantId}/documents/${documentId}/versions/${documentVersionId}/renders/${randomUUID()}-${safeName}`;
  }
}
