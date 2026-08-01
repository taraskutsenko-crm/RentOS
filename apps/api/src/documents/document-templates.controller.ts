import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import {
  CurrentTenant,
  type CurrentTenantContext,
} from "../auth/decorators/current-tenant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PermissionsGuard } from "../permissions/permissions.guard";
import { RequirePermissions } from "../permissions/require-permissions.decorator";
import { TenantGuard } from "../tenants/tenant.guard";
import type { PublicUser } from "../users/user.mapper";
import { DocumentTemplatesService } from "./document-templates.service";
import { CreateDocumentTemplateDto } from "./dto/create-document-template.dto";
import { QueryDocumentTemplatesDto } from "./dto/query-document-templates.dto";
import { UpdateDocumentTemplateContentDto } from "./dto/update-document-template-content.dto";
import { UpdateDocumentTemplateDto } from "./dto/update-document-template.dto";

/**
 * Template management (TASK-0008 Part 2) — `documents.templates.view` for
 * reads, `documents.templates.manage` for every mutation, mirroring the
 * single-"manage"-permission convention already used for
 * `asset_categories.manage`/`rental_settings.manage`/`quotes.manageTemplates`.
 */
@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/document-templates")
export class DocumentTemplatesController {
  constructor(private readonly templatesService: DocumentTemplatesService) {}

  @RequirePermissions("documents.templates.manage")
  @Post()
  create(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Body() dto: CreateDocumentTemplateDto,
  ) {
    return this.templatesService.create(tenant.id, user.id, dto);
  }

  @RequirePermissions("documents.templates.view")
  @Get()
  findMany(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Query() query: QueryDocumentTemplatesDto,
  ) {
    return this.templatesService.findMany(tenant.id, query);
  }

  @RequirePermissions("documents.templates.view")
  @Get(":id")
  findOne(@CurrentTenant() { tenant }: CurrentTenantContext, @Param("id") id: string) {
    return this.templatesService.findOne(tenant.id, id);
  }

  @RequirePermissions("documents.templates.manage")
  @Patch(":id")
  updateMeta(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: UpdateDocumentTemplateDto,
  ) {
    return this.templatesService.updateMeta(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("documents.templates.manage")
  @Post(":id/versions")
  updateContent(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: UpdateDocumentTemplateContentDto,
  ) {
    return this.templatesService.updateContent(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("documents.templates.manage")
  @Post(":id/versions/:versionNumber/restore")
  restoreVersion(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Param("versionNumber", ParseIntPipe) versionNumber: number,
  ) {
    return this.templatesService.restoreVersion(tenant.id, id, user.id, versionNumber);
  }

  @RequirePermissions("documents.templates.manage")
  @Post(":id/activate")
  activate(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
  ) {
    return this.templatesService.activate(tenant.id, id, user.id);
  }

  @RequirePermissions("documents.templates.manage")
  @Post(":id/archive")
  archive(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
  ) {
    return this.templatesService.archive(tenant.id, id, user.id);
  }

  @RequirePermissions("documents.templates.manage")
  @Post(":id/restore")
  restore(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
  ) {
    return this.templatesService.restore(tenant.id, id, user.id);
  }

  @RequirePermissions("documents.templates.manage")
  @Post(":id/duplicate")
  duplicate(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
  ) {
    return this.templatesService.duplicate(tenant.id, id, user.id);
  }
}
