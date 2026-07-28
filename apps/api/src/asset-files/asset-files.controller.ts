import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { MAX_DOCUMENT_SIZE_BYTES, type UploadedFileLike } from "../storage/storage.service";
import { TenantGuard } from "../tenants/tenant.guard";
import type { PublicUser } from "../users/user.mapper";
import { AssetFilesService } from "./asset-files.service";
import { UpdateAssetImageDto } from "./dto/update-asset-image.dto";
import { UploadAssetDocumentDto } from "./dto/upload-asset-document.dto";
import { UploadAssetImageDto } from "./dto/upload-asset-image.dto";

const multerOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES },
};

@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/assets/:assetId")
export class AssetFilesController {
  constructor(private readonly assetFilesService: AssetFilesService) {}

  @RequirePermissions("assets.manage_images")
  @Post("images")
  @UseInterceptors(FileInterceptor("file", multerOptions))
  uploadImage(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("assetId") assetId: string,
    @UploadedFile() file: UploadedFileLike,
    @Body() dto: UploadAssetImageDto,
  ) {
    return this.assetFilesService.uploadImage(tenant.id, assetId, user.id, file, dto);
  }

  @RequirePermissions("assets.manage_images")
  @Patch("images/:imageId")
  updateImage(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("assetId") assetId: string,
    @Param("imageId") imageId: string,
    @Body() dto: UpdateAssetImageDto,
  ) {
    return this.assetFilesService.updateImage(tenant.id, assetId, imageId, dto);
  }

  @RequirePermissions("assets.manage_images")
  @Delete("images/:imageId")
  @HttpCode(HttpStatus.NO_CONTENT)
  removeImage(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("assetId") assetId: string,
    @Param("imageId") imageId: string,
  ) {
    return this.assetFilesService.removeImage(tenant.id, assetId, imageId, user.id);
  }

  @RequirePermissions("assets.read")
  @Get("images/:imageId/file")
  async getImageFile(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("assetId") assetId: string,
    @Param("imageId") imageId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mimeType } = await this.assetFilesService.readImage(
      tenant.id,
      assetId,
      imageId,
    );
    res.type(mimeType).send(buffer);
  }

  @RequirePermissions("assets.manage_documents")
  @Post("documents")
  @UseInterceptors(FileInterceptor("file", multerOptions))
  uploadDocument(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("assetId") assetId: string,
    @UploadedFile() file: UploadedFileLike,
    @Body() dto: UploadAssetDocumentDto,
  ) {
    return this.assetFilesService.uploadDocument(tenant.id, assetId, user.id, file, dto);
  }

  @RequirePermissions("assets.manage_documents")
  @Delete("documents/:documentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  removeDocument(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("assetId") assetId: string,
    @Param("documentId") documentId: string,
  ) {
    return this.assetFilesService.removeDocument(tenant.id, assetId, documentId, user.id);
  }

  @RequirePermissions("assets.read")
  @Get("documents/:documentId/file")
  async getDocumentFile(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("assetId") assetId: string,
    @Param("documentId") documentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mimeType, fileName } = await this.assetFilesService.readDocument(
      tenant.id,
      assetId,
      documentId,
    );
    res.set("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
    res.type(mimeType).send(buffer);
  }
}
