import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { DocumentType, Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import type { PaginatedResult } from "../customers/customers.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  DOCUMENT_TEMPLATE_DETAIL_INCLUDE,
  type DocumentTemplateDetailView,
  type DocumentTemplateListItemView,
} from "./document-template.types";
import type { CreateDocumentTemplateDto } from "./dto/create-document-template.dto";
import type { QueryDocumentTemplatesDto } from "./dto/query-document-templates.dto";
import type { UpdateDocumentTemplateContentDto } from "./dto/update-document-template-content.dto";
import type { UpdateDocumentTemplateDto } from "./dto/update-document-template.dto";

/**
 * DRAFT <-> ACTIVE <-> ARCHIVED. Unlike Document's linear lifecycle, a
 * template can move back and forth: activating a DRAFT template
 * automatically demotes any previously-ACTIVE template for the same
 * (tenant, documentType) back to DRAFT (never ARCHIVED — it's still usable,
 * just no longer the default; see DocumentTemplatesService.activate). An
 * ARCHIVED template can be restored to DRAFT. See ADR 0011.
 */
@Injectable()
export class DocumentTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    dto: CreateDocumentTemplateDto,
  ): Promise<DocumentTemplateDetailView> {
    const created = await this.prisma.$transaction(async (tx) => {
      const template = await tx.documentTemplate.create({
        data: {
          tenantId,
          documentType: dto.documentType,
          name: dto.name,
          description: dto.description ?? null,
          status: "DRAFT",
          currentVersionNumber: 1,
          createdByUserId: actorUserId,
        },
      });

      await tx.documentTemplateVersion.create({
        data: {
          tenantId,
          templateId: template.id,
          versionNumber: 1,
          htmlContent: dto.htmlContent,
          css: dto.css ?? null,
          variablesSchema: (dto.variablesSchema ?? undefined) as never,
          createdByUserId: actorUserId,
        },
      });

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "document_template.created",
          entityType: "DocumentTemplate",
          entityId: template.id,
          metadata: { documentType: dto.documentType, name: dto.name },
        },
        tx,
      );

      return template;
    });

    return this.findOne(tenantId, created.id);
  }

  async findMany(
    tenantId: string,
    query: QueryDocumentTemplatesDto,
  ): Promise<PaginatedResult<DocumentTemplateListItemView>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.DocumentTemplateWhereInput = {
      tenantId,
      ...(query.documentType ? { documentType: query.documentType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.documentTemplate.findMany({
        where,
        include: { _count: { select: { versions: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.documentTemplate.count({ where }),
    ]);

    return {
      items: items.map(({ _count, ...template }) => ({
        ...template,
        versionCount: _count.versions,
      })),
      total,
      page,
      pageSize,
    };
  }

  async findOne(tenantId: string, id: string): Promise<DocumentTemplateDetailView> {
    const template = await this.prisma.documentTemplate.findFirst({
      where: { id, tenantId },
      include: DOCUMENT_TEMPLATE_DETAIL_INCLUDE,
    });
    if (!template) {
      throw new NotFoundException("Document template not found");
    }
    return template;
  }

  /** Resolves the tenant's currently ACTIVE template for a document type, or null if none is active yet. */
  async findActiveForType(
    tenantId: string,
    documentType: DocumentType,
  ): Promise<DocumentTemplateDetailView | null> {
    return this.prisma.documentTemplate.findFirst({
      where: { tenantId, documentType, status: "ACTIVE" },
      include: DOCUMENT_TEMPLATE_DETAIL_INCLUDE,
    });
  }

  async updateMeta(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: UpdateDocumentTemplateDto,
  ): Promise<DocumentTemplateDetailView> {
    const result = await this.prisma.documentTemplate.updateMany({
      where: { id, tenantId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    });
    if (result.count === 0) {
      throw new NotFoundException("Document template not found");
    }
    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "document_template.updated",
      entityType: "DocumentTemplate",
      entityId: id,
      metadata: { changedFields: Object.keys(dto) },
    });
    return this.findOne(tenantId, id);
  }

  /** Always creates a new DocumentTemplateVersion — see the DTO's own doc comment. */
  async updateContent(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: UpdateDocumentTemplateContentDto,
  ): Promise<DocumentTemplateDetailView> {
    const current = await this.findOne(tenantId, id);
    const newVersionNumber = current.currentVersionNumber + 1;

    await this.prisma.$transaction(async (tx) => {
      await tx.documentTemplateVersion.create({
        data: {
          tenantId,
          templateId: id,
          versionNumber: newVersionNumber,
          htmlContent: dto.htmlContent,
          css: dto.css ?? null,
          variablesSchema: (dto.variablesSchema ?? undefined) as never,
          createdByUserId: actorUserId,
        },
      });

      const result = await tx.documentTemplate.updateMany({
        where: { id, tenantId },
        data: { currentVersionNumber: newVersionNumber },
      });
      if (result.count === 0) {
        throw new NotFoundException("Document template not found");
      }

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "document_template.version_created",
          entityType: "DocumentTemplate",
          entityId: id,
          metadata: { versionNumber: newVersionNumber },
        },
        tx,
      );
    });

    return this.findOne(tenantId, id);
  }

  /**
   * Creates a new version whose content is a verbatim copy of an older
   * version — "restore previous version" without ever deleting/reordering
   * history, the same append-only philosophy DocumentsService.createVersion
   * uses for document corrections.
   */
  async restoreVersion(
    tenantId: string,
    id: string,
    actorUserId: string,
    versionNumber: number,
  ): Promise<DocumentTemplateDetailView> {
    const current = await this.findOne(tenantId, id);
    const target = current.versions.find((v) => v.versionNumber === versionNumber);
    if (!target) {
      throw new NotFoundException(`Template version ${versionNumber} not found`);
    }

    return this.updateContent(tenantId, id, actorUserId, {
      htmlContent: target.htmlContent,
      css: target.css,
      ...(target.variablesSchema
        ? { variablesSchema: target.variablesSchema as Record<string, unknown> }
        : {}),
    });
  }

  /**
   * DRAFT/ARCHIVED -> ACTIVE. Transactionally demotes any previously-ACTIVE
   * template for the same (tenantId, documentType) back to DRAFT — mirrors
   * AssetFilesService's isPrimary-image enforcement (see ADR 0005); the
   * partial unique index on (tenantId, documentType) WHERE status='ACTIVE'
   * (see migration 20260731171918) is defense in depth against a bug or a
   * concurrent write bypassing this service.
   */
  async activate(
    tenantId: string,
    id: string,
    actorUserId: string,
  ): Promise<DocumentTemplateDetailView> {
    const target = await this.findOne(tenantId, id);
    if (target.status === "ACTIVE") {
      return target;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.documentTemplate.updateMany({
        where: { tenantId, documentType: target.documentType, status: "ACTIVE" },
        data: { status: "DRAFT" },
      });
      const result = await tx.documentTemplate.updateMany({
        where: { id, tenantId },
        data: { status: "ACTIVE" },
      });
      if (result.count === 0) {
        throw new NotFoundException("Document template not found");
      }
      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "document_template.activated",
          entityType: "DocumentTemplate",
          entityId: id,
          metadata: { documentType: target.documentType },
        },
        tx,
      );
    });

    return this.findOne(tenantId, id);
  }

  async archive(
    tenantId: string,
    id: string,
    actorUserId: string,
  ): Promise<DocumentTemplateDetailView> {
    const result = await this.prisma.documentTemplate.updateMany({
      where: { id, tenantId },
      data: { status: "ARCHIVED" },
    });
    if (result.count === 0) {
      throw new NotFoundException("Document template not found");
    }
    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "document_template.archived",
      entityType: "DocumentTemplate",
      entityId: id,
    });
    return this.findOne(tenantId, id);
  }

  /** ARCHIVED -> DRAFT. Never auto-reactivates — activate() must be called explicitly afterward. */
  async restore(
    tenantId: string,
    id: string,
    actorUserId: string,
  ): Promise<DocumentTemplateDetailView> {
    const current = await this.findOne(tenantId, id);
    if (current.status !== "ARCHIVED") {
      throw new ConflictException("Only an archived template can be restored");
    }
    await this.prisma.documentTemplate.update({
      where: { id },
      data: { status: "DRAFT" },
    });
    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "document_template.restored",
      entityType: "DocumentTemplate",
      entityId: id,
    });
    return this.findOne(tenantId, id);
  }

  /** Creates a fresh DRAFT copy with its own version-1 content, seeded from the source's current version. */
  async duplicate(
    tenantId: string,
    id: string,
    actorUserId: string,
  ): Promise<DocumentTemplateDetailView> {
    const source = await this.findOne(tenantId, id);
    const currentVersion = source.versions.find(
      (v) => v.versionNumber === source.currentVersionNumber,
    )!;

    return this.create(tenantId, actorUserId, {
      documentType: source.documentType,
      name: `${source.name} (copy)`,
      description: source.description,
      htmlContent: currentVersion.htmlContent,
      css: currentVersion.css,
      ...(currentVersion.variablesSchema
        ? { variablesSchema: currentVersion.variablesSchema as Record<string, unknown> }
        : {}),
    });
  }
}
