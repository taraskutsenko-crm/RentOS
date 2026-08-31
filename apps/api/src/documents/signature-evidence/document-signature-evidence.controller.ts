import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { memoryStorage } from "multer";

import {
  CurrentTenant,
  type CurrentTenantContext,
} from "../../auth/decorators/current-tenant.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { PermissionsGuard } from "../../permissions/permissions.guard";
import { RequirePermissions } from "../../permissions/require-permissions.decorator";
import { MAX_IMAGE_SIZE_BYTES, type UploadedFileLike } from "../../storage/storage.service";
import { TenantGuard } from "../../tenants/tenant.guard";
import type { PublicUser } from "../../users/user.mapper";
import { CaptureDocumentSignatureDto } from "./dto/capture-document-signature.dto";
import { DocumentSignatureEvidenceService } from "./document-signature-evidence.service";
import { toPublicSignatureEvidence } from "./document-signature-evidence.mapper";

const multerOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
};

/**
 * Havelio Signature System (docs/PRODUCT_BIBLE.md), NOT a qualified
 * electronic signature. Staff-facing: covers both "sign as the company"
 * (signerType TENANT_REPRESENTATIVE) and "hand the customer my device to
 * sign in person" (signerType CUSTOMER, source resolved as STAFF_DEVICE by
 * the service). Gated on `documents.sign` — the same permission that
 * already gates the plain status-flip `/documents/:id/sign` action.
 */
@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/documents/:id/signatures")
export class DocumentSignatureEvidenceController {
  constructor(private readonly signatureEvidenceService: DocumentSignatureEvidenceService) {}

  @RequirePermissions("documents.view")
  @Get()
  async list(@CurrentTenant() { tenant }: CurrentTenantContext, @Param("id") id: string) {
    const evidence = await this.signatureEvidenceService.list(tenant.id, id);
    return evidence.map(toPublicSignatureEvidence);
  }

  @RequirePermissions("documents.view")
  @Get(":evidenceId/file")
  async getFile(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("id") id: string,
    @Param("evidenceId") evidenceId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mimeType } = await this.signatureEvidenceService.readFile(
      tenant.id,
      id,
      evidenceId,
    );
    res.type(mimeType).send(buffer);
  }

  @RequirePermissions("documents.sign")
  @Post()
  @UseInterceptors(FileInterceptor("file", multerOptions))
  async capture(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body() dto: CaptureDocumentSignatureDto,
  ) {
    // "STAFF_DEVICE" for every staff-initiated capture — the service
    // itself overrides this to "COMPANY_PROFILE" specifically when
    // method is STORED_SIGNATURE (reusing the saved company signature),
    // the one case where the image didn't come from this device at all.
    const { evidence, document } = await this.signatureEvidenceService.capture(
      tenant.id,
      id,
      dto,
      file,
      { actorUserId: user.id, customerId: null, source: "STAFF_DEVICE" },
    );
    return { evidence: toPublicSignatureEvidence(evidence), document };
  }
}
