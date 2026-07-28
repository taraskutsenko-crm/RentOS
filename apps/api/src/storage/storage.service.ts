import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { STORAGE_ADAPTER, type StorageAdapter } from "./storage.types";

export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Thin, storage-adapter-agnostic layer used by AssetFilesService: validates
 * MIME type / size, generates a collision-proof, tenant/asset-namespaced
 * storage key, and delegates the actual bytes to whichever StorageAdapter
 * is bound (local filesystem in dev/test; S3-compatible in production —
 * see docs/adr/0005-asset-file-storage-strategy.md).
 */
@Injectable()
export class StorageService {
  constructor(@Inject(STORAGE_ADAPTER) private readonly adapter: StorageAdapter) {}

  validateImage(file: UploadedFileLike): void {
    this.validate(file, ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGE_SIZE_BYTES, "image");
  }

  validateDocument(file: UploadedFileLike): void {
    this.validate(file, ALLOWED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_SIZE_BYTES, "document");
  }

  buildKey(
    tenantId: string,
    assetId: string,
    kind: "images" | "documents",
    fileName: string,
  ): string {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
    return `tenants/${tenantId}/assets/${assetId}/${kind}/${randomUUID()}-${safeName}`;
  }

  async store(key: string, file: UploadedFileLike): Promise<void> {
    await this.adapter.put(key, file.buffer, file.mimetype);
  }

  read(key: string): Promise<Buffer> {
    return this.adapter.read(key);
  }

  delete(key: string): Promise<void> {
    return this.adapter.delete(key);
  }

  private validate(
    file: UploadedFileLike,
    allowedMimeTypes: readonly string[],
    maxSizeBytes: number,
    label: string,
  ): void {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported ${label} type: ${file.mimetype}. Allowed: ${allowedMimeTypes.join(", ")}`,
      );
    }
    if (file.size > maxSizeBytes) {
      throw new BadRequestException(
        `${label} exceeds the maximum allowed size of ${Math.floor(maxSizeBytes / (1024 * 1024))} MB`,
      );
    }
    if (file.size <= 0) {
      throw new BadRequestException(`${label} is empty`);
    }
  }
}
