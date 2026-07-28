import { Injectable, NotFoundException } from "@nestjs/common";
import type { AssetDocument, AssetImage } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService, type UploadedFileLike } from "../storage/storage.service";
import type { UpdateAssetImageDto } from "./dto/update-asset-image.dto";
import type { UploadAssetDocumentDto } from "./dto/upload-asset-document.dto";
import type { UploadAssetImageDto } from "./dto/upload-asset-image.dto";

@Injectable()
export class AssetFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly storageService: StorageService,
  ) {}

  async uploadImage(
    tenantId: string,
    assetId: string,
    actorUserId: string,
    file: UploadedFileLike,
    dto: UploadAssetImageDto,
  ): Promise<AssetImage> {
    await this.assertAssetBelongsToTenant(tenantId, assetId);
    this.storageService.validateImage(file);

    const key = this.storageService.buildKey(tenantId, assetId, "images", file.originalname);
    await this.storageService.store(key, file);

    const existingImageCount = await this.prisma.assetImage.count({
      where: { tenantId, assetId, deletedAt: null },
    });
    const isPrimary = existingImageCount === 0 ? true : (dto.isPrimary ?? false);

    const image = await this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.assetImage.updateMany({
          where: { tenantId, assetId, isPrimary: true, deletedAt: null },
          data: { isPrimary: false },
        });
      }

      const created = await tx.assetImage.create({
        data: {
          tenantId,
          assetId,
          storageKey: key,
          originalFileName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          isPrimary,
          altText: dto.altText ?? null,
          uploadedByUserId: actorUserId,
          sortOrder: existingImageCount,
        },
      });

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "asset_image.uploaded",
          entityType: "AssetImage",
          entityId: created.id,
          metadata: { assetId, mimeType: file.mimetype, sizeBytes: file.size },
        },
        tx,
      );

      return created;
    });

    return image;
  }

  async updateImage(
    tenantId: string,
    assetId: string,
    imageId: string,
    dto: UpdateAssetImageDto,
  ): Promise<AssetImage> {
    const current = await this.findImage(tenantId, assetId, imageId);

    const image = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.assetImage.updateMany({
          where: { tenantId, assetId, isPrimary: true, deletedAt: null, id: { not: imageId } },
          data: { isPrimary: false },
        });
      }

      return tx.assetImage.update({
        where: { id: current.id },
        data: {
          ...(dto.altText !== undefined ? { altText: dto.altText } : {}),
          ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });
    });

    return image;
  }

  async removeImage(
    tenantId: string,
    assetId: string,
    imageId: string,
    actorUserId: string,
  ): Promise<void> {
    const current = await this.findImage(tenantId, assetId, imageId);

    await this.prisma.assetImage.update({
      where: { id: current.id },
      data: { deletedAt: new Date() },
    });
    await this.storageService.delete(current.storageKey);

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "asset_image.deleted",
      entityType: "AssetImage",
      entityId: imageId,
      metadata: { assetId },
    });
  }

  async readImage(
    tenantId: string,
    assetId: string,
    imageId: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const image = await this.findImage(tenantId, assetId, imageId);
    const buffer = await this.storageService.read(image.storageKey);
    return { buffer, mimeType: image.mimeType };
  }

  async uploadDocument(
    tenantId: string,
    assetId: string,
    actorUserId: string,
    file: UploadedFileLike,
    dto: UploadAssetDocumentDto,
  ): Promise<AssetDocument> {
    await this.assertAssetBelongsToTenant(tenantId, assetId);
    this.storageService.validateDocument(file);

    const key = this.storageService.buildKey(tenantId, assetId, "documents", file.originalname);
    await this.storageService.store(key, file);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.assetDocument.create({
        data: {
          tenantId,
          assetId,
          documentType: dto.documentType,
          title: dto.title,
          storageKey: key,
          originalFileName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          uploadedByUserId: actorUserId,
        },
      });

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "asset_document.uploaded",
          entityType: "AssetDocument",
          entityId: created.id,
          metadata: { assetId, documentType: dto.documentType, mimeType: file.mimetype },
        },
        tx,
      );

      return created;
    });
  }

  async removeDocument(
    tenantId: string,
    assetId: string,
    documentId: string,
    actorUserId: string,
  ): Promise<void> {
    const current = await this.findDocument(tenantId, assetId, documentId);

    await this.prisma.assetDocument.update({
      where: { id: current.id },
      data: { deletedAt: new Date() },
    });
    await this.storageService.delete(current.storageKey);

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "asset_document.deleted",
      entityType: "AssetDocument",
      entityId: documentId,
      metadata: { assetId },
    });
  }

  async readDocument(
    tenantId: string,
    assetId: string,
    documentId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const document = await this.findDocument(tenantId, assetId, documentId);
    const buffer = await this.storageService.read(document.storageKey);
    return { buffer, mimeType: document.mimeType, fileName: document.originalFileName };
  }

  private async assertAssetBelongsToTenant(tenantId: string, assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, tenantId, deletedAt: null },
    });
    if (!asset) {
      throw new NotFoundException("Asset not found");
    }
  }

  private async findImage(tenantId: string, assetId: string, imageId: string): Promise<AssetImage> {
    const image = await this.prisma.assetImage.findFirst({
      where: { id: imageId, tenantId, assetId, deletedAt: null },
    });
    if (!image) {
      throw new NotFoundException("Image not found");
    }
    return image;
  }

  private async findDocument(
    tenantId: string,
    assetId: string,
    documentId: string,
  ): Promise<AssetDocument> {
    const document = await this.prisma.assetDocument.findFirst({
      where: { id: documentId, tenantId, assetId, deletedAt: null },
    });
    if (!document) {
      throw new NotFoundException("Document not found");
    }
    return document;
  }
}
