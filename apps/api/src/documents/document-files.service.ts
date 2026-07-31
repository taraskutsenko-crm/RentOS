import { randomUUID } from "node:crypto";

import { Injectable, NotFoundException } from "@nestjs/common";
import type { DocumentFile } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService, type UploadedFileLike } from "../storage/storage.service";
import type { UploadDocumentFileDto } from "./dto/upload-document-file.dto";

export interface ReadDocumentFileResult {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

/**
 * Staff-uploaded ATTACHMENT/PHOTO files for a specific DocumentVersion —
 * the "Storage" layer, deliberately reusing StorageService as-is (see ADR
 * 0005) rather than introducing a second storage abstraction. Mirrors
 * AssetFilesService's upload/read/soft-delete shape exactly.
 */
@Injectable()
export class DocumentFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
  ) {}

  async upload(
    tenantId: string,
    documentId: string,
    actorUserId: string,
    file: UploadedFileLike,
    dto: UploadDocumentFileDto,
  ): Promise<DocumentFile> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, tenantId, deletedAt: null },
    });
    if (!document) {
      throw new NotFoundException("Document not found");
    }

    const version = await this.prisma.documentVersion.findFirst({
      where: { documentId, tenantId, versionNumber: document.currentVersionNumber },
    });
    if (!version) {
      throw new NotFoundException("Current document version not found");
    }

    this.storageService.validateDocument(file);

    const storageKey = this.buildKey(tenantId, documentId, version.id, file.originalname);
    await this.storageService.store(storageKey, file);

    const created = await this.prisma.documentFile.create({
      data: {
        tenantId,
        documentVersionId: version.id,
        format: dto.format,
        storageKey,
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedByUserId: actorUserId,
      },
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "document.file_uploaded",
      entityType: "Document",
      entityId: documentId,
      metadata: { fileId: created.id, format: dto.format, versionNumber: version.versionNumber },
    });

    return created;
  }

  async read(
    tenantId: string,
    documentId: string,
    fileId: string,
  ): Promise<ReadDocumentFileResult> {
    const file = await this.findFileOrThrow(tenantId, documentId, fileId);
    const buffer = await this.storageService.read(file.storageKey);
    return { buffer, mimeType: file.mimeType, fileName: file.originalFileName };
  }

  async remove(
    tenantId: string,
    documentId: string,
    fileId: string,
    actorUserId: string,
  ): Promise<void> {
    const file = await this.findFileOrThrow(tenantId, documentId, fileId);

    await this.prisma.documentFile.update({
      where: { id: file.id },
      data: { deletedAt: new Date() },
    });
    await this.storageService.delete(file.storageKey);

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "document.file_deleted",
      entityType: "Document",
      entityId: documentId,
      metadata: { fileId },
    });
  }

  private async findFileOrThrow(
    tenantId: string,
    documentId: string,
    fileId: string,
  ): Promise<DocumentFile> {
    const file = await this.prisma.documentFile.findFirst({
      where: { id: fileId, tenantId, deletedAt: null, documentVersion: { documentId, tenantId } },
    });
    if (!file) {
      throw new NotFoundException("File not found");
    }
    return file;
  }

  private buildKey(
    tenantId: string,
    documentId: string,
    documentVersionId: string,
    fileName: string,
  ): string {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
    return `tenants/${tenantId}/documents/${documentId}/versions/${documentVersionId}/${randomUUID()}-${safeName}`;
  }
}
