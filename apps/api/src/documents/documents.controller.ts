import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
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
import { DocumentFilesService } from "./document-files.service";
import { CreateDocumentVersionDto } from "./dto/create-document-version.dto";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { QueryDocumentsDto } from "./dto/query-documents.dto";
import { StatusActionDto } from "./dto/status-action.dto";
import { UpdateDocumentDto } from "./dto/update-document.dto";
import { UploadDocumentFileDto } from "./dto/upload-document-file.dto";
import { DocumentsService } from "./documents.service";
import { DocumentPdfService } from "./rendering/document-pdf.service";
import { DocumentRendererService } from "./rendering/document-renderer.service";

const multerOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES },
};

/**
 * Once a document is fully SIGNED (or otherwise reached a terminal
 * lifecycle state), its rendered content — including the tenant's company
 * branding/logo at that moment — must stay historically true forever (see
 * docs/PRODUCT_BIBLE.md "Company Branding"). Re-rendering here would
 * re-read the tenant's CURRENT logo/company data, silently changing an
 * already-final document. This is deliberately narrower than "isFinal"
 * (which becomes true the moment a version leaves DRAFT): the signature
 * capture flow itself legitimately regenerates a PARTIALLY_SIGNED
 * document's PDF a second time to embed the second signature — that path
 * calls DocumentPdfService.generateAndStore directly, bypassing this
 * controller action entirely, so it is unaffected by this guard.
 */
const PDF_REGENERATION_BLOCKED_STATUSES = new Set(["SIGNED", "REJECTED", "VOIDED", "ARCHIVED"]);

/**
 * Tenant-namespaced under /tenants/:tenantId/documents, consistent with
 * every other business module (see ADR 0001 / ADR 0006's route-namespace
 * rationale). TASK-0008 Part 1 has no public/customer-facing endpoints yet
 * (no signature/view flow exists — see ADR 0010), unlike Quotes.
 */
@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/documents")
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly documentFilesService: DocumentFilesService,
    private readonly documentRenderer: DocumentRendererService,
    private readonly documentPdfService: DocumentPdfService,
  ) {}

  @RequirePermissions("documents.create")
  @Post()
  create(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Body() dto: CreateDocumentDto,
  ) {
    return this.documentsService.create(tenant.id, user.id, dto);
  }

  @RequirePermissions("documents.view")
  @Get()
  findMany(@CurrentTenant() { tenant }: CurrentTenantContext, @Query() query: QueryDocumentsDto) {
    return this.documentsService.findMany(tenant.id, query);
  }

  @RequirePermissions("documents.view")
  @Get(":id")
  findOne(@CurrentTenant() { tenant }: CurrentTenantContext, @Param("id") id: string) {
    return this.documentsService.findOne(tenant.id, id);
  }

  @RequirePermissions("documents.update")
  @Patch(":id")
  update(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentsService.update(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("documents.delete")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
  ) {
    return this.documentsService.remove(tenant.id, id, user.id);
  }

  @RequirePermissions("documents.update")
  @Post(":id/ready")
  markReady(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: StatusActionDto,
  ) {
    return this.documentsService.markReady(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("documents.send")
  @Post(":id/send")
  send(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: StatusActionDto,
  ) {
    return this.documentsService.send(tenant.id, id, user.id, dto);
  }

  /** Staff-recorded (e.g. confirming by phone the customer opened it) — no public view flow exists yet. */
  @RequirePermissions("documents.send")
  @Post(":id/viewed")
  markViewed(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: StatusActionDto,
  ) {
    return this.documentsService.markViewed(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("documents.sign")
  @Post(":id/sign")
  sign(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Query("full") full: string | undefined,
    @Body() dto: StatusActionDto,
  ) {
    return this.documentsService.sign(tenant.id, id, user.id, full !== "false", dto);
  }

  @RequirePermissions("documents.sign")
  @Post(":id/reject")
  reject(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: StatusActionDto,
  ) {
    return this.documentsService.reject(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("documents.void")
  @Post(":id/void")
  voidDocument(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: StatusActionDto,
  ) {
    return this.documentsService.voidDocument(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("documents.archive")
  @Post(":id/archive")
  archive(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: StatusActionDto,
  ) {
    return this.documentsService.archive(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("documents.create")
  @Post(":id/duplicate")
  duplicate(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
  ) {
    return this.documentsService.duplicate(tenant.id, id, user.id);
  }

  @RequirePermissions("documents.update")
  @Post(":id/versions")
  createVersion(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: CreateDocumentVersionDto,
  ) {
    return this.documentsService.createVersion(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("documents.view")
  @Get(":id/history")
  history(@CurrentTenant() { tenant }: CurrentTenantContext, @Param("id") id: string) {
    return this.documentsService.history(tenant.id, id);
  }

  /** Live HTML render — never stored (see DocumentRendererService's own doc comment). */
  @RequirePermissions("documents.render")
  @Get(":id/preview")
  async preview(@CurrentTenant() { tenant }: CurrentTenantContext, @Param("id") id: string) {
    const document = await this.documentsService.findOneRaw(tenant.id, id);
    const version = document.versions.find(
      (v) => v.versionNumber === document.currentVersionNumber,
    )!;
    return this.documentRenderer.renderHtml(tenant.id, document, version);
  }

  /** Serves the most recently generated PDF, generating one on first request if none exists yet. */
  @RequirePermissions("documents.download")
  @Get(":id/pdf")
  async getPdf(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Res() res: Response,
  ): Promise<void> {
    const document = await this.documentsService.findOneRaw(tenant.id, id);
    const version = document.versions.find(
      (v) => v.versionNumber === document.currentVersionNumber,
    )!;
    const existing = await this.documentPdfService.getLatest(version);
    const { buffer, file } =
      existing ??
      (await this.documentPdfService.generateAndStore(tenant.id, document, version, user.id));
    if (!existing) {
      await this.documentsService.recordRender(tenant.id, id, user.id, file.id);
    }
    await this.documentsService.recordDownload(tenant.id, id, user.id, file.id);
    res.set(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(file.originalFileName)}"`,
    );
    res.type("application/pdf").send(buffer);
  }

  /**
   * Forces regeneration — creates a new DocumentFile row tied to the
   * current version and returns the fresh PDF bytes. Blocked once the
   * document has reached a terminal state (see
   * PDF_REGENERATION_BLOCKED_STATUSES above) — a finalized document's
   * rendered content, including its embedded company logo, must never
   * change after the fact.
   */
  @RequirePermissions("documents.render")
  @Post(":id/pdf")
  async regeneratePdf(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Res() res: Response,
  ): Promise<void> {
    const document = await this.documentsService.findOneRaw(tenant.id, id);
    if (PDF_REGENERATION_BLOCKED_STATUSES.has(document.status)) {
      throw new ConflictException(
        `Cannot regenerate the PDF of a ${document.status} document — its rendered content is final`,
      );
    }
    const version = document.versions.find(
      (v) => v.versionNumber === document.currentVersionNumber,
    )!;
    const { buffer, file } = await this.documentPdfService.generateAndStore(
      tenant.id,
      document,
      version,
      user.id,
    );
    await this.documentsService.recordRender(tenant.id, id, user.id, file.id);
    res.set(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(file.originalFileName)}"`,
    );
    res.type("application/pdf").send(buffer);
  }

  @RequirePermissions("documents.update")
  @Post(":id/files")
  @UseInterceptors(FileInterceptor("file", multerOptions))
  uploadFile(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @UploadedFile() file: UploadedFileLike,
    @Body() dto: UploadDocumentFileDto,
  ) {
    return this.documentFilesService.upload(tenant.id, id, user.id, file, dto);
  }

  @RequirePermissions("documents.download")
  @Get(":id/files/:fileId/file")
  async getFile(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Param("fileId") fileId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mimeType, fileName } = await this.documentFilesService.read(
      tenant.id,
      id,
      fileId,
    );
    await this.documentsService.recordDownload(tenant.id, id, user.id, fileId);
    res.set("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
    res.type(mimeType).send(buffer);
  }

  @RequirePermissions("documents.update")
  @Delete(":id/files/:fileId")
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFile(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Param("fileId") fileId: string,
  ) {
    return this.documentFilesService.remove(tenant.id, id, fileId, user.id);
  }
}
