import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { DocumentStatus, DocumentType, Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import type { PaginatedResult } from "../customers/customers.service";
import { PrismaService } from "../prisma/prisma.service";
import { generateDocumentNumber } from "./document-numbering.util";
import {
  DOCUMENT_DETAIL_INCLUDE,
  type DocumentDetailView,
  type DocumentListItemView,
  type DocumentVersionWithFiles,
} from "./document.types";
import type { CreateDocumentVersionDto } from "./dto/create-document-version.dto";
import type { CreateDocumentDto } from "./dto/create-document.dto";
import type { DocumentItemDto } from "./dto/document-item.dto";
import type { QueryDocumentsDto } from "./dto/query-documents.dto";
import type { StatusActionDto } from "./dto/status-action.dto";
import type { UpdateDocumentDto } from "./dto/update-document.dto";
import type { DocumentTimelineEvent, DocumentTimelineEventType } from "./timeline.types";

/** A DRAFT document was never finalized, so deleting it destroys nothing legally significant. VOIDED is an explicit dead end. */
const DELETABLE_STATUSES: DocumentStatus[] = ["DRAFT", "VOIDED"];

/**
 * DRAFT -> READY -> SENT -> (VIEWED ->) PARTIALLY_SIGNED/SIGNED/REJECTED,
 * with VOIDED reachable from every non-terminal state and SIGNED/REJECTED/
 * VOIDED additionally reachable to ARCHIVED. VIEWED is an optional
 * intermediate, not a mandatory gate before signing/rejecting — staff may
 * record a signature obtained out-of-band (e.g. a scanned wet-ink
 * signature) without the document ever having gone through an online
 * "viewed" event. See docs/adr/0010-document-management-platform.md.
 */
const ALLOWED_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  DRAFT: ["READY", "VOIDED"],
  READY: ["SENT", "VOIDED"],
  SENT: ["VIEWED", "PARTIALLY_SIGNED", "SIGNED", "REJECTED", "VOIDED"],
  VIEWED: ["PARTIALLY_SIGNED", "SIGNED", "REJECTED", "VOIDED"],
  PARTIALLY_SIGNED: ["SIGNED", "VOIDED"],
  SIGNED: ["ARCHIVED"],
  REJECTED: ["ARCHIVED", "VOIDED"],
  VOIDED: ["ARCHIVED"],
  ARCHIVED: [],
};

/**
 * Every status transition always writes a DocumentStatusHistory row (the
 * timeline always surfaces these as "status_changed"); this map covers only
 * the subset of transitions that ALSO get a distinctly-named, richer
 * timeline entry via the audit log — mirroring Quotes' identical
 * either/or split (e.g. `quote.sent` vs. the plain `quote.status_changed`
 * used for cancel/expire).
 */
const AUDIT_ACTION_TO_TIMELINE_TYPE: Record<string, DocumentTimelineEventType> = {
  "document.updated": "updated",
  "document.sent": "sent",
  "document.viewed": "viewed",
  "document.signed": "signed",
  "document.downloaded": "downloaded",
  "document.archived": "archived",
  "document.version_created": "version_created",
  "document.file_uploaded": "file_uploaded",
  "document.file_deleted": "file_deleted",
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    dto: CreateDocumentDto,
  ): Promise<DocumentDetailView> {
    this.assertCustomTypeName(dto.documentType, dto.customTypeName);
    if (dto.customerId) await this.assertCustomerBelongsToTenant(tenantId, dto.customerId);
    if (dto.rentalId) await this.assertRentalBelongsToTenant(tenantId, dto.rentalId);
    if (dto.quoteId) await this.assertQuoteBelongsToTenant(tenantId, dto.quoteId);
    if (dto.assetId) await this.assertAssetBelongsToTenant(tenantId, dto.assetId);
    if (dto.employeeUserId) await this.assertUserIsTenantMember(tenantId, dto.employeeUserId);
    const items = dto.items ?? [];
    await this.assertItemsValid(tenantId, items);

    const created = await this.prisma.$transaction(async (tx) => {
      const documentNumber = await generateDocumentNumber(
        tx,
        tenantId,
        dto.documentType,
        new Date(),
      );

      const document = await tx.document.create({
        data: {
          tenantId,
          documentType: dto.documentType,
          customTypeName: dto.documentType === "CUSTOM" ? (dto.customTypeName ?? null) : null,
          documentNumber,
          status: "DRAFT",
          title: dto.title ?? null,
          customerId: dto.customerId ?? null,
          rentalId: dto.rentalId ?? null,
          quoteId: dto.quoteId ?? null,
          assetId: dto.assetId ?? null,
          employeeUserId: dto.employeeUserId ?? null,
          currentVersionNumber: 1,
          createdByUserId: actorUserId,
        },
      });

      await tx.documentVersion.create({
        data: {
          tenantId,
          documentId: document.id,
          versionNumber: 1,
          businessDataSnapshot: (dto.businessData ?? {}) as never,
          isFinal: false,
          createdByUserId: actorUserId,
        },
      });

      for (let i = 0; i < items.length; i += 1) {
        await tx.documentItem.create({
          data: toDocumentItemCreateData(tenantId, document.id, items[i]!, i),
        });
      }

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "document.created",
          entityType: "Document",
          entityId: document.id,
          metadata: { documentNumber, documentType: dto.documentType, itemCount: items.length },
        },
        tx,
      );

      return document;
    });

    return this.findOne(tenantId, created.id);
  }

  async findMany(
    tenantId: string,
    query: QueryDocumentsDto,
  ): Promise<PaginatedResult<DocumentListItemView>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.DocumentWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.documentType ? { documentType: query.documentType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.rentalId ? { rentalId: query.rentalId } : {}),
      ...(query.quoteId ? { quoteId: query.quoteId } : {}),
      ...(query.assetId ? { assetId: query.assetId } : {}),
      ...(query.createdByUserId ? { createdByUserId: query.createdByUserId } : {}),
      ...(query.search
        ? {
            OR: [
              { documentNumber: { contains: query.search, mode: "insensitive" } },
              { title: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        include: { customer: true, _count: { select: { items: true } } },
        orderBy: { [query.sortBy ?? "createdAt"]: query.sortDirection ?? "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      items: items.map(({ _count, ...document }) => ({ ...document, itemCount: _count.items })),
      total,
      page,
      pageSize,
    };
  }

  async findOne(tenantId: string, id: string): Promise<DocumentDetailView> {
    return this.findOneRaw(tenantId, id);
  }

  /** Only allowed while the document's current version is still DRAFT (not yet finalized). */
  async update(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: UpdateDocumentDto,
  ): Promise<DocumentDetailView> {
    const current = await this.findOneRaw(tenantId, id);
    if (current.status !== "DRAFT") {
      throw new ConflictException(
        "A document can only be edited in place while DRAFT — once it has left DRAFT its current version is finalized; create a new version instead",
      );
    }

    if (dto.customerId !== undefined)
      await this.assertCustomerBelongsToTenant(tenantId, dto.customerId);
    if (dto.rentalId !== undefined) await this.assertRentalBelongsToTenant(tenantId, dto.rentalId);
    if (dto.quoteId !== undefined) await this.assertQuoteBelongsToTenant(tenantId, dto.quoteId);
    if (dto.assetId !== undefined) await this.assertAssetBelongsToTenant(tenantId, dto.assetId);
    if (dto.employeeUserId !== undefined) {
      await this.assertUserIsTenantMember(tenantId, dto.employeeUserId);
    }
    if (dto.items !== undefined) {
      await this.assertItemsValid(tenantId, dto.items);
    }

    const currentVersion = this.requireVersion(current, current.currentVersionNumber);

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.document.updateMany({
        where: { id, tenantId, deletedAt: null, status: "DRAFT" },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.customerId !== undefined ? { customerId: dto.customerId } : {}),
          ...(dto.rentalId !== undefined ? { rentalId: dto.rentalId } : {}),
          ...(dto.quoteId !== undefined ? { quoteId: dto.quoteId } : {}),
          ...(dto.assetId !== undefined ? { assetId: dto.assetId } : {}),
          ...(dto.employeeUserId !== undefined ? { employeeUserId: dto.employeeUserId } : {}),
          updatedByUserId: actorUserId,
        },
      });
      if (result.count === 0) {
        throw new ConflictException("Document status changed concurrently — please retry");
      }

      if (dto.businessData !== undefined) {
        await tx.documentVersion.update({
          where: { id: currentVersion.id },
          data: { businessDataSnapshot: dto.businessData as never },
        });
      }

      if (dto.items !== undefined) {
        await tx.documentItem.deleteMany({ where: { documentId: id, tenantId } });
        for (let i = 0; i < dto.items.length; i += 1) {
          await tx.documentItem.create({
            data: toDocumentItemCreateData(tenantId, id, dto.items[i]!, i),
          });
        }
      }

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "document.updated",
          entityType: "Document",
          entityId: id,
          metadata: { changedFields: Object.keys(dto) },
        },
        tx,
      );
    });

    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string, actorUserId: string): Promise<void> {
    const current = await this.findOneRaw(tenantId, id);
    if (!DELETABLE_STATUSES.includes(current.status)) {
      throw new ConflictException(
        `Cannot delete a document in ${current.status} status — void it first if it must be removed`,
      );
    }

    const result = await this.prisma.document.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException("Document not found");
    }

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "document.deleted",
      entityType: "Document",
      entityId: id,
    });
  }

  /** DRAFT -> READY. Finalizes version 1 (or the current correction version), making it permanently immutable. */
  async markReady(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: StatusActionDto,
  ): Promise<DocumentDetailView> {
    return this.changeStatus(
      tenantId,
      id,
      actorUserId,
      "READY",
      dto.reason,
      "document.status_changed",
    );
  }

  /** READY -> SENT. */
  async send(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: StatusActionDto,
  ): Promise<DocumentDetailView> {
    return this.changeStatus(tenantId, id, actorUserId, "SENT", dto.reason, "document.sent");
  }

  /**
   * SENT -> VIEWED. A staff-recorded action (e.g. confirming by phone that
   * the customer opened it) — there is no public/customer-facing view flow
   * yet (see ADR 0010), so this is never triggered automatically in Part 1.
   */
  async markViewed(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: StatusActionDto,
  ): Promise<DocumentDetailView> {
    return this.changeStatus(tenantId, id, actorUserId, "VIEWED", dto.reason, "document.viewed");
  }

  /** SENT/VIEWED -> PARTIALLY_SIGNED or SIGNED, depending on `fullySigned`. No real e-signature integration yet — this only records the outcome. */
  async sign(
    tenantId: string,
    id: string,
    actorUserId: string,
    fullySigned: boolean,
    dto: StatusActionDto,
  ): Promise<DocumentDetailView> {
    return this.changeStatus(
      tenantId,
      id,
      actorUserId,
      fullySigned ? "SIGNED" : "PARTIALLY_SIGNED",
      dto.reason,
      "document.signed",
      { fullySigned },
    );
  }

  /** SENT/VIEWED -> REJECTED. */
  async reject(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: StatusActionDto,
  ): Promise<DocumentDetailView> {
    return this.changeStatus(
      tenantId,
      id,
      actorUserId,
      "REJECTED",
      dto.reason,
      "document.status_changed",
    );
  }

  /** Any non-terminal status -> VOIDED. */
  async voidDocument(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: StatusActionDto,
  ): Promise<DocumentDetailView> {
    return this.changeStatus(
      tenantId,
      id,
      actorUserId,
      "VOIDED",
      dto.reason,
      "document.status_changed",
    );
  }

  /** SIGNED/REJECTED/VOIDED -> ARCHIVED. */
  async archive(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: StatusActionDto,
  ): Promise<DocumentDetailView> {
    return this.changeStatus(
      tenantId,
      id,
      actorUserId,
      "ARCHIVED",
      dto.reason,
      "document.archived",
    );
  }

  /**
   * Creates a correction: a brand-new DocumentVersion (parentVersionId =
   * the version being corrected), only callable once the current version
   * is already finalized (status is not DRAFT — see ADR 0010). Resets the
   * document to DRAFT so the correction can itself be reviewed and
   * finalized again via markReady. Bypasses ALLOWED_TRANSITIONS
   * deliberately — this is a distinct "correction" action, not a plain
   * status transition.
   */
  async createVersion(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: CreateDocumentVersionDto,
  ): Promise<DocumentDetailView> {
    const current = await this.findOneRaw(tenantId, id);
    if (current.status === "DRAFT") {
      throw new ConflictException(
        "Document is still DRAFT — edit it directly instead of creating a correction version",
      );
    }

    const currentVersion = this.requireVersion(current, current.currentVersionNumber);
    const newVersionNumber = current.currentVersionNumber + 1;
    const businessData =
      dto.businessData ?? (currentVersion.businessDataSnapshot as Record<string, unknown>);

    await this.prisma.$transaction(async (tx) => {
      await tx.documentVersion.create({
        data: {
          tenantId,
          documentId: id,
          versionNumber: newVersionNumber,
          parentVersionId: currentVersion.id,
          businessDataSnapshot: businessData as never,
          isFinal: false,
          reason: dto.reason,
          createdByUserId: actorUserId,
        },
      });

      const result = await tx.document.updateMany({
        where: { id, tenantId, deletedAt: null },
        data: {
          currentVersionNumber: newVersionNumber,
          status: "DRAFT",
          updatedByUserId: actorUserId,
        },
      });
      if (result.count === 0) {
        throw new NotFoundException("Document not found");
      }

      await tx.documentStatusHistory.create({
        data: {
          tenantId,
          documentId: id,
          fromStatus: current.status,
          toStatus: "DRAFT",
          changedByUserId: actorUserId,
          reason: `Correction: ${dto.reason}`,
        },
      });

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "document.version_created",
          entityType: "Document",
          entityId: id,
          metadata: {
            versionNumber: newVersionNumber,
            parentVersionNumber: currentVersion.versionNumber,
            reason: dto.reason,
          },
        },
        tx,
      );
    });

    return this.findOne(tenantId, id);
  }

  async history(tenantId: string, id: string): Promise<DocumentTimelineEvent[]> {
    const document = await this.findOneRaw(tenantId, id);

    const [logs, statusHistory] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          tenantId,
          entityType: "Document",
          entityId: id,
          action: { in: Object.keys(AUDIT_ACTION_TO_TIMELINE_TYPE) },
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.documentStatusHistory.findMany({
        where: { tenantId, documentId: id },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const events: DocumentTimelineEvent[] = [
      {
        id: `created-${document.id}`,
        type: "created",
        occurredAt: document.createdAt.toISOString(),
        actorUserId: document.createdByUserId,
        data: { documentNumber: document.documentNumber, documentType: document.documentType },
      },
      ...logs.map((log) => ({
        id: log.id,
        type: AUDIT_ACTION_TO_TIMELINE_TYPE[log.action]!,
        occurredAt: log.createdAt.toISOString(),
        actorUserId: log.userId,
        data: (log.metadata as Record<string, unknown> | null) ?? {},
      })),
      ...statusHistory.map((entry) => ({
        id: entry.id,
        type: "status_changed" as const,
        occurredAt: entry.createdAt.toISOString(),
        actorUserId: entry.changedByUserId,
        data: { fromStatus: entry.fromStatus, toStatus: entry.toStatus, reason: entry.reason },
      })),
    ];

    return events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  /** Called by the controller whenever a rendered/uploaded file is actually streamed back. */
  async recordDownload(
    tenantId: string,
    id: string,
    actorUserId: string,
    fileId: string,
  ): Promise<void> {
    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "document.downloaded",
      entityType: "Document",
      entityId: id,
      metadata: { fileId },
    });
  }

  // ---------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------

  async findOneRaw(tenantId: string, id: string): Promise<DocumentDetailView> {
    const document = await this.prisma.document.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: DOCUMENT_DETAIL_INCLUDE,
    });
    if (!document) {
      throw new NotFoundException("Document not found");
    }
    return document as DocumentDetailView;
  }

  private requireVersion(
    document: DocumentDetailView,
    versionNumber: number,
  ): DocumentVersionWithFiles {
    const version = document.versions.find((v) => v.versionNumber === versionNumber);
    if (!version) {
      throw new NotFoundException(`Document version ${versionNumber} not found`);
    }
    return version;
  }

  private async changeStatus(
    tenantId: string,
    id: string,
    actorUserId: string,
    toStatus: DocumentStatus,
    reason: string | null | undefined,
    auditAction: string,
    extraMetadata: Record<string, unknown> = {},
  ): Promise<DocumentDetailView> {
    const current = await this.findOneRaw(tenantId, id);
    if (current.status === toStatus) {
      return this.findOne(tenantId, id);
    }
    this.assertTransition(current.status, toStatus);

    const finalizesCurrentVersion = current.status === "DRAFT";

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.document.updateMany({
        where: { id, tenantId, status: current.status, deletedAt: null },
        data: { status: toStatus, updatedByUserId: actorUserId },
      });
      if (result.count === 0) {
        throw new ConflictException("Document status changed concurrently — please retry");
      }

      if (finalizesCurrentVersion) {
        const currentVersion = this.requireVersion(current, current.currentVersionNumber);
        await tx.documentVersion.update({
          where: { id: currentVersion.id },
          data: { isFinal: true, finalizedAt: new Date() },
        });
      }

      await tx.documentStatusHistory.create({
        data: {
          tenantId,
          documentId: id,
          fromStatus: current.status,
          toStatus,
          changedByUserId: actorUserId,
          reason: reason ?? null,
        },
      });

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: auditAction,
          entityType: "Document",
          entityId: id,
          metadata: {
            from: current.status,
            to: toStatus,
            reason: reason ?? null,
            ...extraMetadata,
          },
        },
        tx,
      );
    });

    return this.findOne(tenantId, id);
  }

  private assertTransition(from: DocumentStatus, to: DocumentStatus): void {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new ConflictException(`Cannot transition a document from ${from} to ${to}`);
    }
  }

  private assertCustomTypeName(
    documentType: DocumentType,
    customTypeName: string | undefined,
  ): void {
    if (documentType === "CUSTOM" && !customTypeName) {
      throw new BadRequestException("customTypeName is required when documentType is CUSTOM");
    }
    if (documentType !== "CUSTOM" && customTypeName) {
      throw new BadRequestException(
        "customTypeName must not be set when documentType is not CUSTOM",
      );
    }
  }

  private async assertCustomerBelongsToTenant(
    tenantId: string,
    customerId: string | undefined,
  ): Promise<void> {
    if (!customerId) return;
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
  }

  private async assertRentalBelongsToTenant(
    tenantId: string,
    rentalId: string | undefined,
  ): Promise<void> {
    if (!rentalId) return;
    const rental = await this.prisma.rental.findFirst({
      where: { id: rentalId, tenantId, deletedAt: null },
    });
    if (!rental) {
      throw new NotFoundException("Rental not found");
    }
  }

  private async assertQuoteBelongsToTenant(
    tenantId: string,
    quoteId: string | undefined,
  ): Promise<void> {
    if (!quoteId) return;
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, tenantId, deletedAt: null },
    });
    if (!quote) {
      throw new NotFoundException("Quote not found");
    }
  }

  private async assertAssetBelongsToTenant(
    tenantId: string,
    assetId: string | undefined,
  ): Promise<void> {
    if (!assetId) return;
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, tenantId, deletedAt: null },
    });
    if (!asset) {
      throw new NotFoundException("Asset not found");
    }
  }

  private async assertUserIsTenantMember(
    tenantId: string,
    userId: string | undefined,
  ): Promise<void> {
    if (!userId) return;
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { tenantId, userId, status: "ACTIVE" },
    });
    if (!membership) {
      throw new NotFoundException("Employee user is not an active member of this tenant");
    }
  }

  private async assertItemsValid(tenantId: string, items: DocumentItemDto[]): Promise<void> {
    const assetIds = new Set<string>();
    const rentalItemIds = new Set<string>();
    for (const item of items) {
      if (item.assetId) assetIds.add(item.assetId);
      if (item.rentalItemId) rentalItemIds.add(item.rentalItemId);
    }

    if (assetIds.size > 0) {
      const assets = await this.prisma.asset.findMany({
        where: { id: { in: [...assetIds] }, tenantId, deletedAt: null },
      });
      const found = new Set(assets.map((asset) => asset.id));
      const missing = [...assetIds].filter((assetId) => !found.has(assetId));
      if (missing.length > 0) {
        throw new NotFoundException(`Asset(s) not found in this tenant: ${missing.join(", ")}`);
      }
    }

    if (rentalItemIds.size > 0) {
      const rentalItems = await this.prisma.rentalItem.findMany({
        where: { id: { in: [...rentalItemIds] }, tenantId },
      });
      const found = new Set(rentalItems.map((item) => item.id));
      const missing = [...rentalItemIds].filter((rentalItemId) => !found.has(rentalItemId));
      if (missing.length > 0) {
        throw new NotFoundException(
          `Rental item(s) not found in this tenant: ${missing.join(", ")}`,
        );
      }
    }
  }
}

function toDocumentItemCreateData(
  tenantId: string,
  documentId: string,
  item: DocumentItemDto,
  index: number,
): Prisma.DocumentItemUncheckedCreateInput {
  return {
    tenantId,
    documentId,
    assetId: item.assetId ?? null,
    rentalItemId: item.rentalItemId ?? null,
    description: item.description ?? null,
    dataJson: item.data as never,
    sortOrder: item.sortOrder ?? index,
  };
}
