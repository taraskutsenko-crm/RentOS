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
import { CompanyLogoService } from "./company-logo.service";

const multerOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
};

/**
 * Havelio Company Branding (docs/PRODUCT_BIBLE.md). Upload/replace/remove
 * gated on `tenant.manage` (OWNER/ADMIN only, the same tier as the rest of
 * Company Profile) — reading the logo file itself is open to any active
 * tenant member (no `@RequirePermissions`), matching the task's "any staff
 * viewing the logo is fine" instruction.
 */
@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/company-logo")
export class CompanyLogoController {
  constructor(private readonly companyLogoService: CompanyLogoService) {}

  @Get("file")
  async getFile(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mimeType } = await this.companyLogoService.readFile(tenant.id);
    res.type(mimeType).send(buffer);
  }

  @RequirePermissions("tenant.manage")
  @Post()
  @UseInterceptors(FileInterceptor("file", multerOptions))
  async upload(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @UploadedFile() file: UploadedFileLike,
  ) {
    const updated = await this.companyLogoService.upload(tenant.id, user.id, file);
    return { tenant: updated };
  }

  @RequirePermissions("tenant.manage")
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() { tenant }: CurrentTenantContext, @CurrentUser() user: PublicUser) {
    return this.companyLogoService.remove(tenant.id, user.id);
  }
}
