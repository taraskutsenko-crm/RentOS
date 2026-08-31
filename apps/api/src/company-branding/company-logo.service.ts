import { createHash, randomUUID } from "node:crypto";

import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Tenant } from "@prisma/client";
import sharp, { type Metadata } from "sharp";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService, type UploadedFileLike } from "../storage/storage.service";

/**
 * Canonical stored/rendered format — every accepted source format
 * (PNG/JPEG/WebP) is normalized to this one on upload (see `normalize()`
 * below), so every document renderer consumes the exact same representation.
 * PNG specifically because it's the one format every renderer in this
 * codebase can decode natively: pdfkit's `doc.image()` (Quote PDF) only
 * understands PNG/JPEG, never WebP — normalizing away that gap here means
 * no per-renderer format special-casing is needed anywhere downstream (see
 * docs/DECISIONS.md D-119). PNG also preserves transparency losslessly,
 * unlike JPEG.
 */
const CANONICAL_LOGO_MIME_TYPE = "image/png";

/**
 * Contain-style bounding box for the NORMALIZED, stored rendition — well
 * above anything any document header ever displays a logo at (all renderers
 * additionally constrain display size themselves, e.g. `.doc-header__logo`
 * CSS / pdfkit's `fit: [130, 50]`), while keeping the stored file (and
 * therefore every PDF/email that embeds it) reasonably sized even for a
 * very large source upload. `withoutEnlargement` in `normalize()` means a
 * smaller source logo is never upscaled past its own resolution.
 */
const MAX_NORMALIZED_DIMENSION_PX = 1600;

/**
 * Image-bomb protection for the ORIGINAL uploaded file, before
 * normalization — a legitimate logo has no reason to exceed this in either
 * dimension. Also used as sharp's own `limitInputPixels` guard so a small,
 * highly-compressed file that would decode into an enormous pixel buffer
 * (a decompression bomb) is rejected before any decoding work happens, not
 * just after.
 */
const MAX_SOURCE_DIMENSION_PX = 8000;

/** The only source formats `normalize()` accepts — matches `StorageService.validateImage`'s MIME allowlist, but checked against sharp's own real decoded format, never the client-supplied Content-Type/extension. */
const ALLOWED_SOURCE_FORMATS = new Set(["png", "jpeg", "webp"]);

export interface ReadCompanyLogoResult {
  buffer: Buffer;
  mimeType: string;
}

interface NormalizedImage {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Havelio Company Branding (docs/PRODUCT_BIBLE.md) — the tenant's own logo,
 * shown on its generated customer-facing documents instead of a generic
 * Havelio placeholder. Stored directly on the `Tenant` row (a logo is a
 * true singleton per tenant, unlike the reusable-vs-per-document split the
 * signature system needs) — see CompanySignatureService's own doc comment
 * for why that system needed a separate table and this one doesn't.
 *
 * Every upload is decoded, validated, and normalized server-side into one
 * canonical raster (`normalize()`) before it's ever stored — see
 * docs/DECISIONS.md D-119. "Replace" and "remove" delete the PREVIOUS
 * storage object: unlike the Signature System's per-document evidence
 * (which must survive a later company-signature change), nothing in this
 * codebase ever re-reads an old logo object once the tenant's pointer moves
 * — every consumer either freezes the bytes into a persisted
 * document/snapshot at generation time (Document PDF, Invoice
 * `sellerSnapshot`, Quote PDF) or always resolves the CURRENT pointer live
 * (draft previews, the portal branding endpoint) — so retaining orphaned
 * objects forever served no purpose and only grew storage unboundedly
 * across repeated uploads (see D-119 for the full analysis).
 */
@Injectable()
export class CompanyLogoService {
  private readonly logger = new Logger(CompanyLogoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
  ) {}

  async upload(tenantId: string, actorUserId: string, file: UploadedFileLike): Promise<Tenant> {
    // MIME allowlist (PNG/JPEG/WebP) + 8MB size cap — same StorageService
    // validation every other image upload in this codebase uses. Not
    // trusted alone: normalize() below decodes the real bytes with sharp,
    // which is the actual "is this really an allowed image" check (a
    // MIME-allowlisted but malformed, disguised, or wrong-format file is
    // rejected there instead, based on what it truly decodes as).
    this.storageService.validateImage(file);

    const normalized = await this.normalize(file.buffer);

    const existing = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { logoStorageKey: true },
    });

    const storageKey = this.buildKey(tenantId);
    await this.storageService.store(storageKey, {
      buffer: normalized.buffer,
      mimetype: CANONICAL_LOGO_MIME_TYPE,
      originalname: file.originalname,
      size: normalized.buffer.length,
    });
    const checksumSha256 = createHash("sha256").update(normalized.buffer).digest("hex");

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        logoStorageKey: storageKey,
        logoMimeType: CANONICAL_LOGO_MIME_TYPE,
        logoOriginalFileName: file.originalname,
        logoWidth: normalized.width,
        logoHeight: normalized.height,
        logoSizeBytes: normalized.buffer.length,
        logoChecksumSha256: checksumSha256,
        logoUploadedAt: new Date(),
        logoUploadedByUserId: actorUserId,
      },
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: existing.logoStorageKey ? "company_logo.replaced" : "company_logo.uploaded",
      entityType: "Tenant",
      entityId: tenantId,
      metadata: {
        mimeType: CANONICAL_LOGO_MIME_TYPE,
        sourceMimeType: file.mimetype,
        sizeBytes: normalized.buffer.length,
        width: normalized.width,
        height: normalized.height,
      },
    });

    // The previous object (if any) is never read again by any code path
    // once the pointer above has moved — see this class's doc comment and
    // D-119. Best-effort: a delete failure here must never fail the
    // upload that already succeeded — it just leaves one orphaned object,
    // the same outcome the old "never delete" behavior always had.
    if (existing.logoStorageKey) {
      try {
        await this.storageService.delete(existing.logoStorageKey);
      } catch (error) {
        this.logger.warn(
          `Failed to delete the previous company logo object (${existing.logoStorageKey}): ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    return updated;
  }

  async readFile(tenantId: string): Promise<ReadCompanyLogoResult> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { logoStorageKey: true, logoMimeType: true },
    });
    if (!tenant?.logoStorageKey || !tenant.logoMimeType) {
      throw new NotFoundException("No company logo is configured");
    }
    const buffer = await this.storageService.read(tenant.logoStorageKey);
    return { buffer, mimeType: tenant.logoMimeType };
  }

  async remove(tenantId: string, actorUserId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { logoStorageKey: true },
    });
    if (!tenant?.logoStorageKey) {
      throw new NotFoundException("No company logo is configured");
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        logoStorageKey: null,
        logoMimeType: null,
        logoOriginalFileName: null,
        logoWidth: null,
        logoHeight: null,
        logoSizeBytes: null,
        logoChecksumSha256: null,
        logoUploadedAt: null,
        logoUploadedByUserId: null,
      },
    });

    // Safe to delete — see this class's doc comment and D-119: nothing
    // reads this object again once the pointer is cleared. Best-effort,
    // same as upload()'s cleanup.
    try {
      await this.storageService.delete(tenant.logoStorageKey);
    } catch (error) {
      this.logger.warn(
        `Failed to delete the removed company logo object (${tenant.logoStorageKey}): ${error instanceof Error ? error.message : error}`,
      );
    }

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "company_logo.removed",
      entityType: "Tenant",
      entityId: tenantId,
    });
  }

  /**
   * Decodes, validates, and normalizes an uploaded logo into the canonical
   * document-safe raster every renderer consumes (see this file's top
   * doc comment and D-119). Contain-style resize (never crops, never
   * stretches, never upscales a smaller source) into a
   * `MAX_NORMALIZED_DIMENSION_PX` box, re-encoded as PNG — which also
   * strips any EXIF/color-profile metadata the source carried, since
   * sharp's `.png()` only re-emits pixel data by default.
   */
  private async normalize(sourceBuffer: Buffer): Promise<NormalizedImage> {
    let metadata: Metadata;
    try {
      metadata = await sharp(sourceBuffer, {
        // Decompression-bomb guard — rejects before decoding a pixel buffer
        // larger than this, regardless of how small the compressed file is.
        limitInputPixels: MAX_SOURCE_DIMENSION_PX * MAX_SOURCE_DIMENSION_PX,
      }).metadata();
    } catch {
      throw new BadRequestException(
        "The uploaded file could not be decoded as a valid image — it may be corrupted or not a real image",
      );
    }

    if (!metadata.width || !metadata.height) {
      throw new BadRequestException(
        "The uploaded file could not be decoded as a valid image — it may be corrupted or not a real image",
      );
    }
    // The real decoded format is the authority here, never the client's
    // claimed Content-Type or the filename's extension — a file whose
    // bytes don't genuinely decode as one of these three formats is
    // rejected even if StorageService.validateImage's MIME check passed.
    if (!metadata.format || !ALLOWED_SOURCE_FORMATS.has(metadata.format)) {
      throw new BadRequestException(
        "Unsupported image format — upload a PNG, JPEG, or WebP file",
      );
    }
    if (metadata.width > MAX_SOURCE_DIMENSION_PX || metadata.height > MAX_SOURCE_DIMENSION_PX) {
      throw new BadRequestException(
        `Image dimensions exceed the maximum allowed (${MAX_SOURCE_DIMENSION_PX}px)`,
      );
    }

    let normalizedBuffer: Buffer;
    try {
      normalizedBuffer = await sharp(sourceBuffer, {
        limitInputPixels: MAX_SOURCE_DIMENSION_PX * MAX_SOURCE_DIMENSION_PX,
      })
        .resize({
          width: MAX_NORMALIZED_DIMENSION_PX,
          height: MAX_NORMALIZED_DIMENSION_PX,
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
    } catch {
      throw new BadRequestException(
        "The uploaded file could not be decoded as a valid image — it may be corrupted or not a real image",
      );
    }

    const normalizedMetadata = await sharp(normalizedBuffer).metadata();
    if (!normalizedMetadata.width || !normalizedMetadata.height) {
      throw new BadRequestException(
        "The uploaded file could not be decoded as a valid image — it may be corrupted or not a real image",
      );
    }

    return {
      buffer: normalizedBuffer,
      width: normalizedMetadata.width,
      height: normalizedMetadata.height,
    };
  }

  /** Canonical `.png` extension always — the stored format is fixed by normalize(), never dependent on the original upload's filename/format. */
  private buildKey(tenantId: string): string {
    return `tenants/${tenantId}/branding/logo/${randomUUID()}.png`;
  }
}
