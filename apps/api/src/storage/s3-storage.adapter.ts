import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnv } from "@rentos/shared";

import type { StorageAdapter } from "./storage.types";

/**
 * Production-capable object-storage adapter — works against any
 * S3-compatible provider (AWS S3, Cloudflare R2, Backblaze B2, MinIO, ...)
 * behind the exact same `StorageAdapter` interface `LocalFilesystemStorageAdapter`
 * implements, so no caller (StorageService/AssetFilesService/
 * DocumentFilesService/DocumentPdfService/QuotePdfService) changes at all —
 * selecting this adapter is a pure `STORAGE_DRIVER=s3` env-var flip (see
 * storage.module.ts). See docs/adr/0013-production-storage-and-email.md.
 *
 * Deliberately keeps no vendor-specific business logic here — the domain
 * layer (StorageService and everything above it) never imports `@aws-sdk/*`
 * directly, matching ADR 0005's locked seam ("nothing outside storage/ may
 * import a storage SDK").
 *
 * Objects are always written private (no ACL is ever set to public-read);
 * every read in this codebase goes through an authenticated streaming
 * controller endpoint (`GET .../file`), never a direct bucket URL — see
 * DECISIONS.md's production-storage entry. `S3_PUBLIC_BASE_URL` is accepted
 * in config for a possible future CDN-fronted read path but is not
 * consulted by this adapter today; nothing here generates or returns a raw
 * bucket URL.
 */
@Injectable()
export class S3StorageAdapter implements StorageAdapter, OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(configService: ConfigService<ApiEnv, true>) {
    const endpoint = configService.get("S3_ENDPOINT", { infer: true });
    const region = configService.get("S3_REGION", { infer: true });
    const bucket = configService.get("S3_BUCKET", { infer: true });
    const accessKeyId = configService.get("S3_ACCESS_KEY_ID", { infer: true });
    const secretAccessKey = configService.get("S3_SECRET_ACCESS_KEY", { infer: true });
    const forcePathStyle = configService.get("S3_FORCE_PATH_STYLE", { infer: true });

    const missing = [
      !region && "S3_REGION",
      !bucket && "S3_BUCKET",
      !accessKeyId && "S3_ACCESS_KEY_ID",
      !secretAccessKey && "S3_SECRET_ACCESS_KEY",
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new Error(
        `STORAGE_DRIVER=s3 requires ${missing.join(", ")} to be set (S3_ENDPOINT is optional — omit it for real AWS S3, set it for R2/B2/MinIO/other S3-compatible endpoints).`,
      );
    }

    this.bucket = bucket!;
    this.client = new S3Client({
      region: region!,
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    });
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
        // Every object is private; nothing in this codebase relies on a
        // public bucket policy or object ACL (see class doc comment).
      }),
    );
  }

  async read(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) {
      throw new Error(`Empty response body reading storage key: ${key}`);
    }
    const bytes = await result.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    // S3's DeleteObject is already a no-op (not an error) for a missing
    // key — matches LocalFilesystemStorageAdapter's contract with zero
    // extra handling needed.
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (error instanceof NotFound) return false;
      // A HeadObject 404 sometimes surfaces as a generic error with a 404
      // statusCode rather than the typed NotFound class, depending on the
      // S3-compatible provider — check that shape too before rethrowing.
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (status === 404) return false;
      throw error;
    }
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}
