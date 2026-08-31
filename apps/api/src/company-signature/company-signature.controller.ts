import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { memoryStorage } from "multer";

import {
  CurrentTenant,
  type CurrentTenantContext,
} from "../auth/decorators/current-tenant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PermissionsGuard } from "../permissions/permissions.guard";
import { RequirePermissions } from "../permissions/require-permissions.decorator";
import { MAX_IMAGE_SIZE_BYTES, type UploadedFileLike } from "../storage/storage.service";
import { TenantGuard } from "../tenants/tenant.guard";
import type { PublicUser } from "../users/user.mapper";
import { CompanySignatureService } from "./company-signature.service";
import { UploadCompanySignatureDto } from "./dto/upload-company-signature.dto";
import { toPublicTenantSignature } from "./tenant-signature.mapper";

const multerOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
};

/**
 * Havelio Signature System (docs/PRODUCT_BIBLE.md), NOT a qualified
 * electronic signature. Two permission tiers deliberately split (Phase 8
 * of the task this shipped under): `tenant.manage` (OWNER/ADMIN only) to
 * create/replace/delete the tenant's saved signature — the same tier that
 * already gates the rest of Company Profile — versus `documents.sign`
 * (anyone who can sign a document, which includes MANAGER/TECHNICIAN) to
 * read it for use while signing.
 */
@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/company-signature")
export class CompanySignatureController {
  constructor(private readonly companySignatureService: CompanySignatureService) {}

  @RequirePermissions("documents.sign")
  @Get()
  async findActive(@CurrentTenant() { tenant }: CurrentTenantContext) {
    const signature = await this.companySignatureService.findActive(tenant.id);
    return { signature: signature ? toPublicTenantSignature(signature) : null };
  }

  @RequirePermissions("documents.sign")
  @Get("file")
  async getFile(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mimeType } = await this.companySignatureService.readFile(tenant.id);
    res.type(mimeType).send(buffer);
  }

  @RequirePermissions("tenant.manage")
  @Post()
  @UseInterceptors(FileInterceptor("file", multerOptions))
  async upload(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @UploadedFile() file: UploadedFileLike,
    @Body() dto: UploadCompanySignatureDto,
  ) {
    const signature = await this.companySignatureService.upload(tenant.id, user.id, file, dto);
    return toPublicTenantSignature(signature);
  }

  @RequirePermissions("tenant.manage")
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() { tenant }: CurrentTenantContext, @CurrentUser() user: PublicUser) {
    return this.companySignatureService.remove(tenant.id, user.id);
  }
}
