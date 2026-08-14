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
import { PreviewDocumentTemplateDto } from "./dto/preview-document-template.dto";
import { QueryActiveLanguagesDto } from "./dto/query-active-languages.dto";
import { QueryDocumentTemplatesDto } from "./dto/query-document-templates.dto";
import { UpdateDocumentTemplateContentDto } from "./dto/update-document-template-content.dto";
import { UpdateDocumentTemplateDto } from "./dto/update-document-template.dto";
import { DocumentRendererService } from "./rendering/document-renderer.service";

/**
 * Template management (TASK-0008 Part 2) — `documents.templates.view` for
 * reads, `documents.templates.manage` for every mutation, mirroring the
 * single-"manage"-permission convention already used for
 * `asset_categories.manage`/`rental_settings.manage`/`quotes.manageTemplates`.
 */
@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/document-templates")
export class DocumentTemplatesController {
  constructor(
    private readonly templatesService: DocumentTemplatesService,
    private readonly documentRenderer: DocumentRendererService,
  ) {}

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

  /**
   * Renders unsaved draft HTML/CSS from the no-code builder against
   * synthetic sample data — lets a template author preview before any real
   * Document exists, and before the draft is even saved as a version. Must
   * be declared before the :id route below, same reason as
   * "active-languages". Gated by `documents.templates.view` (not
   * `documents.templates.manage`) so a read-only viewer on the template
   * detail page can preview the saved content too, not only someone
   * actively editing it — and not `documents.render`, which is scoped to
   * real Document instances.
   */
  @RequirePermissions("documents.templates.view")
  @Post("preview")
  preview(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Body() dto: PreviewDocumentTemplateDto,
  ) {
    return this.documentRenderer.renderPreviewHtml(
      tenant.id,
      dto.documentType,
      dto.htmlContent,
      dto.css ?? null,
    );
  }

  /**
   * Feeds the "Generate document" flow's language picker — gated by
   * documents.create (not documents.templates.view), since anyone who can
   * create a document needs to know whether a language choice is required,
   * regardless of whether they can manage templates themselves. Must be
   * declared before the :id route below or Nest would match "active-languages"
   * as an :id param instead.
   */
  @RequirePermissions("documents.create")
  @Get("active-languages")
  activeLanguages(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Query() query: QueryActiveLanguagesDto,
  ) {
    return this.templatesService
      .activeLanguagesForType(tenant.id, query.documentType)
      .then((languages) => ({ languages }));
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
