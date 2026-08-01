import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";

import {
  CurrentTenant,
  type CurrentTenantContext,
} from "../../auth/decorators/current-tenant.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { PermissionsGuard } from "../../permissions/permissions.guard";
import { RequirePermissions } from "../../permissions/require-permissions.decorator";
import { TenantGuard } from "../../tenants/tenant.guard";
import type { PublicUser } from "../../users/user.mapper";
import { CreateShareLinkDto } from "../dto/create-share-link.dto";
import { DocumentSharingService } from "./document-sharing.service";

/** Authenticated share-link management — see PublicDocumentsController for the public-facing half. */
@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/documents/:id/share")
export class DocumentSharingController {
  constructor(private readonly sharingService: DocumentSharingService) {}

  @RequirePermissions("documents.share")
  @Post()
  create(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: CreateShareLinkDto,
  ) {
    return this.sharingService.create(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("documents.share")
  @Get()
  findMany(@CurrentTenant() { tenant }: CurrentTenantContext, @Param("id") id: string) {
    return this.sharingService.findMany(tenant.id, id);
  }

  @RequirePermissions("documents.share")
  @Delete(":shareLinkId")
  @HttpCode(HttpStatus.NO_CONTENT)
  disable(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Param("shareLinkId") shareLinkId: string,
  ) {
    return this.sharingService.disable(tenant.id, id, shareLinkId, user.id);
  }
}
