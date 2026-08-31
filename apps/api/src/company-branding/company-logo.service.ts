import { createHash, randomUUID } from "node:crypto";

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { imageSize } from "image-size";
import type { Tenant } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService, type UploadedFileLike } from "../storage/storage.service";

/** Image-bomb protection — a logo has no legitimate reason to be larger than this in either dimension. */
const MAX_LOGO_DIMENSION_PX = 8000;

export interface ReadCompanyLogoResult {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Havelio Company Branding (docs/PRODUCT_BIBLE.md) — the tenant's own logo,
 * shown on its generated customer-facing documents instead of a generic
 * Havelio placeholder. Stored directly on the `Tenant` row (a logo is a
 * true singleton per tenant, unlike the reusable-vs-per-document split the
 * signature system needs) — see CompanySignatureService's own doc comment
 * for why that system needed a separate table and this one doesn't.
 *
 * "Replace" and "remove" only ever update these pointer fields on Tenant —
 * the underlying storage object at the previous key is never deleted, so
 * any document that already embedded those exact bytes (a finalized
 * Document PDF, or an Invoice/Quote's frozen snapshot) is never
 * retroactively affected by a later logo change (see docs/DECISIONS.md).
 */
@Injectable()
export class CompanyLogoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
  ) {}

  async upload(
    tenantId: string,
    actorUserId: string,
    file: UploadedFileLike,
  ): Promise<Tenant> {
    // MIME allowlist (PNG/JPEG/WebP) + size cap — same StorageService
    // validation every other image upload in this codebase uses. Not
    // trusted alone: the imageSize() decode below is the actual
    // "is this really an image" check (a MIME-allowlisted but malformed or
    // disguised file fails to decode and is rejected there instead).
    this.storageService.validateImage(file);

    let width: number;
    let height: number;
    try {
      const decoded = imageSize(file.buffer);
      if (!decoded.width || !decoded.height) {
        throw new Error("missing dimensions");
      }
      width = decoded.width;
      height = decoded.height;
    } catch {
      throw new BadRequestException(
        "The uploaded file could not be decoded as a valid image — it may be corrupted or not a real image",
      );
    }
    if (width > MAX_LOGO_DIMENSION_PX || height > MAX_LOGO_DIMENSION_PX) {
      throw new BadRequestException(
        `Image dimensions exceed the maximum allowed (${MAX_LOGO_DIMENSION_PX}px)`,
      );
    }

    const existing = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { logoStorageKey: true },
    });

    const storageKey = this.buildKey(tenantId, file.originalname);
    await this.storageService.store(storageKey, file);
    const checksumSha256 = createHash("sha256").update(file.buffer).digest("hex");

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        logoStorageKey: storageKey,
        logoMimeType: file.mimetype,
        logoOriginalFileName: file.originalname,
        logoWidth: width,
        logoHeight: height,
        logoSizeBytes: file.size,
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
      metadata: { mimeType: file.mimetype, sizeBytes: file.size, width, height },
    });

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

    // Clears the pointer only — the storage object itself is left in
    // place, same rationale as CompanySignatureService.remove(): any
    // document/invoice/quote that already captured these bytes (embedded
    // base64 in a finalized PDF, or a frozen sellerSnapshot) keeps working
    // regardless, and there is no defined retention policy that would
    // justify an unrecoverable hard delete here.
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

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "company_logo.removed",
      entityType: "Tenant",
      entityId: tenantId,
    });
  }

  private buildKey(tenantId: string, fileName: string): string {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
    return `tenants/${tenantId}/branding/logo/${randomUUID()}-${safeName}`;
  }
}
