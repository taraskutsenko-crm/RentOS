import { randomUUID, createHash } from "node:crypto";

import { Injectable, NotFoundException } from "@nestjs/common";
import type { TenantSignature } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService, type UploadedFileLike } from "../storage/storage.service";
import type { UploadCompanySignatureDto } from "./dto/upload-company-signature.dto";

export interface ReadCompanySignatureResult {
  buffer: Buffer;
  mimeType: string;
}

/**
 * The tenant's single reusable, company-level handwritten signature —
 * Havelio Signature System (docs/PRODUCT_BIBLE.md), NOT a qualified
 * electronic signature. Mirrors AssetFilesService's upload/read/soft-delete
 * shape; "replace" is soft-delete-old + create-new rather than an in-place
 * update, so `deletedAt` alone (no separate history table) already answers
 * "what was the company signature at some point in the past" if ever
 * needed, while `findActive` always resolves the single current one.
 *
 * Reused during document signing by DocumentSignatureEvidenceService,
 * which always COPIES these bytes into its own row — this service and its
 * storage key are never referenced from an already-captured
 * DocumentSignatureEvidence, so replacing/deleting a TenantSignature here
 * can never alter a historical signed document (see that model's own
 * schema comment).
 */
@Injectable()
export class CompanySignatureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
  ) {}

  async findActive(tenantId: string): Promise<TenantSignature | null> {
    return this.prisma.tenantSignature.findFirst({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async upload(
    tenantId: string,
    actorUserId: string,
    file: UploadedFileLike,
    dto: UploadCompanySignatureDto,
  ): Promise<TenantSignature> {
    this.storageService.validateImage(file);

    const storageKey = this.buildKey(tenantId, file.originalname);
    await this.storageService.store(storageKey, file);
    const checksumSha256 = createHash("sha256").update(file.buffer).digest("hex");

    const created = await this.prisma.$transaction(async (tx) => {
      // Soft-delete any previously active signature — at most one active
      // row per tenant, same single-current-row convention as
      // AssetImage.isPrimary. The old row (and its storage object) is
      // never hard-deleted here; it simply stops being "the" active one.
      await tx.tenantSignature.updateMany({
        where: { tenantId, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      const signature = await tx.tenantSignature.create({
        data: {
          tenantId,
          representativeName: dto.representativeName,
          representativeTitle: dto.representativeTitle ?? null,
          storageKey,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          checksumSha256,
          method: dto.method,
          createdByUserId: actorUserId,
        },
      });

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "company_signature.saved",
          entityType: "TenantSignature",
          entityId: signature.id,
          metadata: {
            method: dto.method,
            representativeName: dto.representativeName,
            mimeType: file.mimetype,
            sizeBytes: file.size,
          },
        },
        tx,
      );

      return signature;
    });

    return created;
  }

  async readFile(tenantId: string): Promise<ReadCompanySignatureResult> {
    const signature = await this.findActive(tenantId);
    if (!signature) {
      throw new NotFoundException("No company signature is configured");
    }
    const buffer = await this.storageService.read(signature.storageKey);
    return { buffer, mimeType: signature.mimeType };
  }

  async remove(tenantId: string, actorUserId: string): Promise<void> {
    const signature = await this.findActive(tenantId);
    if (!signature) {
      throw new NotFoundException("No company signature is configured");
    }

    // Soft-delete only — the storage object is left in place. A
    // DocumentSignatureEvidence row captured earlier via "use saved
    // signature" already copied these exact bytes into its own storageKey
    // (see DocumentSignatureEvidenceService), so nothing historical reads
    // this object; there is no correctness reason to also delete it from
    // storage, and doing so would be an unrecoverable, undocumented
    // deletion this task does not define a retention policy for.
    await this.prisma.tenantSignature.update({
      where: { id: signature.id },
      data: { deletedAt: new Date() },
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "company_signature.deleted",
      entityType: "TenantSignature",
      entityId: signature.id,
    });
  }

  private buildKey(tenantId: string, fileName: string): string {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
    return `tenants/${tenantId}/signatures/company/${randomUUID()}-${safeName}`;
  }
}
