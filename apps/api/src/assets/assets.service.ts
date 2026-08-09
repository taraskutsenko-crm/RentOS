import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AssetCustomFieldDefinition,
  AssetDocument,
  AssetImage,
  Document,
  Prisma,
  RentalStatus,
} from "@prisma/client";

import { AssetStatusesService } from "../asset-statuses/asset-statuses.service";
import { AuditService } from "../audit/audit.service";
import type { PaginatedResult } from "../customers/customers.service";
import { PrismaService } from "../prisma/prisma.service";
import { computeItemLineTotalMinor } from "../rentals/rental-pricing.util";
import { AssetFieldValuesService, type AssetWithCustomFields } from "./asset-field-values.service";
import { buildAssetWhere, parseCustomFieldsFilter } from "./asset-query.util";
import type { ChangeAssetLocationDto } from "./dto/change-asset-location.dto";
import type { ChangeAssetStatusDto } from "./dto/change-asset-status.dto";
import type { CreateAssetDto } from "./dto/create-asset.dto";
import type { QueryAssetsDto } from "./dto/query-assets.dto";
import type { UpdateAssetDto } from "./dto/update-asset.dto";
import type { AssetSummary } from "./summary.types";
import type { AssetTimelineEvent } from "./timeline.types";

const ASSET_INCLUDE = {
  category: true,
  currentStatus: true,
} satisfies Prisma.AssetInclude;

/** Rentals that represent real, counted business activity — DRAFT and CANCELLED are excluded. */
const COUNTED_RENTAL_STATUSES: RentalStatus[] = ["RESERVED", "ACTIVE", "RETURNED", "COMPLETED"];

export const ASSET_PLATFORM_DOCUMENT_SELECT = {
  id: true,
  documentType: true,
  customTypeName: true,
  documentNumber: true,
  status: true,
  title: true,
  createdAt: true,
} satisfies Prisma.DocumentSelect;

export type AssetPlatformDocumentView = Pick<
  Document,
  "id" | "documentType" | "customTypeName" | "documentNumber" | "status" | "title" | "createdAt"
>;

type AssetWithRelations = Prisma.AssetGetPayload<{ include: typeof ASSET_INCLUDE }>;

export interface AssetListItemView extends AssetWithCustomFields<AssetWithRelations> {
  primaryImage: AssetImage | null;
}

export interface AssetDetailView extends AssetWithCustomFields<AssetWithRelations> {
  images: AssetImage[];
  documents: AssetDocument[];
  platformDocuments: AssetPlatformDocumentView[];
}

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly assetStatusesService: AssetStatusesService,
    private readonly fieldValuesService: AssetFieldValuesService,
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    dto: CreateAssetDto,
  ): Promise<AssetDetailView> {
    await this.assertCategoryBelongsToTenant(tenantId, dto.categoryId);
    this.assertMoneyPairing(
      dto.purchasePriceMinor,
      dto.purchaseCurrency,
      "purchasePriceMinor",
      "purchaseCurrency",
    );
    this.assertMoneyPairing(
      dto.replacementValueMinor,
      dto.replacementCurrency,
      "replacementValueMinor",
      "replacementCurrency",
    );

    const statusId = dto.statusId ?? (await this.resolveDefaultStatusId(tenantId));
    await this.assertStatusBelongsToTenant(tenantId, statusId);

    await this.assertUnique(tenantId, "internalNumber", dto.internalNumber);
    if (dto.sku) await this.assertUnique(tenantId, "sku", dto.sku);
    if (dto.serialNumber) await this.assertUnique(tenantId, "serialNumber", dto.serialNumber);
    if (dto.barcode) await this.assertUnique(tenantId, "barcode", dto.barcode);
    if (dto.qrCodeValue) await this.assertUnique(tenantId, "qrCodeValue", dto.qrCodeValue);

    const definitions = await this.fieldValuesService.getApplicableDefinitions(
      tenantId,
      dto.categoryId,
    );
    const resolvedValues = this.fieldValuesService.resolve(definitions, dto.customFields, {});

    const { customFields: _customFields, statusId: _statusId, ...assetData } = dto;

    const asset = await this.prisma.$transaction(async (tx) => {
      const created = await tx.asset.create({
        data: {
          ...assetData,
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null,
          tenantId,
          currentStatusId: statusId,
          createdByUserId: actorUserId,
        },
        include: ASSET_INCLUDE,
      });

      for (const value of resolvedValues) {
        await tx.assetCustomFieldValue.create({
          data: {
            assetId: created.id,
            tenantId,
            fieldDefinitionId: value.fieldDefinitionId,
            valueJson: value.valueJson as never,
          },
        });
      }

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "asset.created",
          entityType: "Asset",
          entityId: created.id,
          metadata: { internalNumber: created.internalNumber, categoryId: created.categoryId },
        },
        tx,
      );

      return created;
    });

    return this.findOne(tenantId, asset.id);
  }

  async findMany(
    tenantId: string,
    query: QueryAssetsDto,
  ): Promise<PaginatedResult<AssetListItemView>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const customFieldsFilter = parseCustomFieldsFilter(query.customFields);
    const filterClauses = await this.buildCustomFieldFilterClauses(tenantId, customFieldsFilter);
    const where = buildAssetWhere(tenantId, query, filterClauses);

    const [items, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        include: ASSET_INCLUDE,
        orderBy: { [query.sortBy ?? "createdAt"]: query.sortDirection ?? "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.asset.count({ where }),
    ]);

    const primaryImages = items.length
      ? await this.prisma.assetImage.findMany({
          where: {
            tenantId,
            assetId: { in: items.map((item) => item.id) },
            isPrimary: true,
            deletedAt: null,
          },
        })
      : [];
    const primaryImageByAssetId = new Map(primaryImages.map((image) => [image.assetId, image]));

    const itemsWithFields = await Promise.all(
      items.map(async (item) => {
        const valuesByKey = await this.fieldValuesService.getExistingValuesByKey(item.id);
        return {
          ...this.fieldValuesService.attach(item, valuesByKey),
          primaryImage: primaryImageByAssetId.get(item.id) ?? null,
        };
      }),
    );

    return { items: itemsWithFields, total, page, pageSize };
  }

  async findOne(tenantId: string, id: string): Promise<AssetDetailView> {
    const asset = await this.prisma.asset.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: ASSET_INCLUDE,
    });
    if (!asset) {
      throw new NotFoundException("Asset not found");
    }
    const [valuesByKey, images, documents, platformDocuments] = await Promise.all([
      this.fieldValuesService.getExistingValuesByKey(asset.id),
      this.prisma.assetImage.findMany({
        where: { tenantId, assetId: id, deletedAt: null },
        orderBy: { sortOrder: "asc" },
      }),
      this.prisma.assetDocument.findMany({
        where: { tenantId, assetId: id, deletedAt: null },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.document.findMany({
        where: { tenantId, assetId: id, deletedAt: null },
        select: ASSET_PLATFORM_DOCUMENT_SELECT,
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return {
      ...this.fieldValuesService.attach(asset, valuesByKey),
      images,
      documents,
      platformDocuments,
    };
  }

  async update(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: UpdateAssetDto,
  ): Promise<AssetDetailView> {
    const current = await this.findOne(tenantId, id);

    if (dto.categoryId && dto.categoryId !== current.categoryId) {
      await this.assertCategoryBelongsToTenant(tenantId, dto.categoryId);
    }

    this.assertMoneyPairing(
      dto.purchasePriceMinor ?? current.purchasePriceMinor ?? undefined,
      dto.purchaseCurrency !== undefined ? dto.purchaseCurrency : current.purchaseCurrency,
      "purchasePriceMinor",
      "purchaseCurrency",
    );
    this.assertMoneyPairing(
      dto.replacementValueMinor ?? current.replacementValueMinor ?? undefined,
      dto.replacementCurrency !== undefined ? dto.replacementCurrency : current.replacementCurrency,
      "replacementValueMinor",
      "replacementCurrency",
    );

    if (dto.internalNumber && dto.internalNumber !== current.internalNumber) {
      await this.assertUnique(tenantId, "internalNumber", dto.internalNumber, id);
    }
    if (dto.sku && dto.sku !== current.sku) {
      await this.assertUnique(tenantId, "sku", dto.sku, id);
    }
    if (dto.serialNumber && dto.serialNumber !== current.serialNumber) {
      await this.assertUnique(tenantId, "serialNumber", dto.serialNumber, id);
    }
    if (dto.barcode && dto.barcode !== current.barcode) {
      await this.assertUnique(tenantId, "barcode", dto.barcode, id);
    }
    if (dto.qrCodeValue && dto.qrCodeValue !== current.qrCodeValue) {
      await this.assertUnique(tenantId, "qrCodeValue", dto.qrCodeValue, id);
    }

    const effectiveCategoryId = dto.categoryId ?? current.categoryId;
    const definitions = await this.fieldValuesService.getApplicableDefinitions(
      tenantId,
      effectiveCategoryId,
    );
    const existingByKey = await this.fieldValuesService.getExistingValuesByKey(id);
    const resolvedValues = this.fieldValuesService.resolve(
      definitions,
      dto.customFields,
      existingByKey,
    );

    const { customFields: _customFields, ...assetData } = dto;

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.asset.updateMany({
        where: { id, tenantId, deletedAt: null },
        data: {
          ...assetData,
          ...(dto.purchaseDate !== undefined
            ? { purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null }
            : {}),
          updatedByUserId: actorUserId,
        } as Prisma.AssetUncheckedUpdateManyInput,
      });
      if (result.count === 0) {
        throw new NotFoundException("Asset not found");
      }

      for (const value of resolvedValues) {
        await tx.assetCustomFieldValue.upsert({
          where: {
            assetId_fieldDefinitionId: { assetId: id, fieldDefinitionId: value.fieldDefinitionId },
          },
          create: {
            assetId: id,
            tenantId,
            fieldDefinitionId: value.fieldDefinitionId,
            valueJson: value.valueJson as never,
          },
          update: { valueJson: value.valueJson as never },
        });
      }

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "asset.updated",
          entityType: "Asset",
          entityId: id,
          metadata: { changedFields: Object.keys(dto) },
        },
        tx,
      );
    });

    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string, actorUserId: string): Promise<void> {
    const result = await this.prisma.asset.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
    if (result.count === 0) {
      throw new NotFoundException("Asset not found");
    }

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "asset.deleted",
      entityType: "Asset",
      entityId: id,
    });
  }

  async changeStatus(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: ChangeAssetStatusDto,
  ): Promise<AssetDetailView> {
    const current = await this.findOne(tenantId, id);
    const newStatus = await this.assetStatusesService.findOne(tenantId, dto.statusId);
    if (!newStatus.isActive) {
      throw new BadRequestException("Cannot set an inactive status");
    }

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.asset.updateMany({
        where: { id, tenantId, deletedAt: null },
        data: { currentStatusId: newStatus.id, updatedByUserId: actorUserId },
      });
      if (result.count === 0) {
        throw new NotFoundException("Asset not found");
      }

      await tx.assetStatusHistory.create({
        data: {
          tenantId,
          assetId: id,
          fromStatusId: current.currentStatusId,
          toStatusId: newStatus.id,
          changedByUserId: actorUserId,
          reason: dto.reason ?? null,
        },
      });

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "asset.status_changed",
          entityType: "Asset",
          entityId: id,
          metadata: { fromStatusCode: current.currentStatus.code, toStatusCode: newStatus.code },
        },
        tx,
      );
    });

    return this.findOne(tenantId, id);
  }

  async changeLocation(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: ChangeAssetLocationDto,
  ): Promise<AssetDetailView> {
    const current = await this.findOne(tenantId, id);

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.asset.updateMany({
        where: { id, tenantId, deletedAt: null },
        data: { currentLocationText: dto.newLocation, updatedByUserId: actorUserId },
      });
      if (result.count === 0) {
        throw new NotFoundException("Asset not found");
      }

      await tx.assetLocationHistory.create({
        data: {
          tenantId,
          assetId: id,
          previousLocation: current.currentLocationText,
          newLocation: dto.newLocation,
          changedByUserId: actorUserId,
          reason: dto.reason ?? null,
        },
      });

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "asset.location_changed",
          entityType: "Asset",
          entityId: id,
          metadata: { previousLocation: current.currentLocationText, newLocation: dto.newLocation },
        },
        tx,
      );
    });

    return this.findOne(tenantId, id);
  }

  /**
   * Combines creation, updates (from AuditLog), status changes, location
   * changes, image uploads, and document uploads into one normalized,
   * chronologically-ordered (oldest first) event list. Every underlying
   * query is scoped by both tenantId and assetId — see test
   * "Timeline is tenant-isolated".
   */
  async timeline(tenantId: string, id: string): Promise<AssetTimelineEvent[]> {
    const asset = await this.findOne(tenantId, id);

    const [updateLogs, statusHistory, locationHistory, images, documents] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { tenantId, entityType: "Asset", entityId: id, action: "asset.updated" },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.assetStatusHistory.findMany({
        where: { tenantId, assetId: id },
        include: { fromStatus: true, toStatus: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.assetLocationHistory.findMany({
        where: { tenantId, assetId: id },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.assetImage.findMany({
        where: { tenantId, assetId: id },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.assetDocument.findMany({
        where: { tenantId, assetId: id },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const events: AssetTimelineEvent[] = [
      {
        id: `created-${asset.id}`,
        type: "created",
        occurredAt: asset.createdAt.toISOString(),
        actorUserId: asset.createdByUserId,
        data: { internalNumber: asset.internalNumber, categoryId: asset.categoryId },
      },
      ...updateLogs.map((log) => ({
        id: log.id,
        type: "updated" as const,
        occurredAt: log.createdAt.toISOString(),
        actorUserId: log.userId,
        data: (log.metadata as Record<string, unknown> | null) ?? {},
      })),
      ...statusHistory.map((entry) => ({
        id: entry.id,
        type: "status_changed" as const,
        occurredAt: entry.createdAt.toISOString(),
        actorUserId: entry.changedByUserId,
        data: {
          fromStatus: entry.fromStatus
            ? { id: entry.fromStatus.id, code: entry.fromStatus.code, name: entry.fromStatus.name }
            : null,
          toStatus: { id: entry.toStatus.id, code: entry.toStatus.code, name: entry.toStatus.name },
          reason: entry.reason,
        },
      })),
      ...locationHistory.map((entry) => ({
        id: entry.id,
        type: "location_changed" as const,
        occurredAt: entry.createdAt.toISOString(),
        actorUserId: entry.changedByUserId,
        data: {
          previousLocation: entry.previousLocation,
          newLocation: entry.newLocation,
          reason: entry.reason,
        },
      })),
      ...images.map((image) => ({
        id: image.id,
        type: "image_uploaded" as const,
        occurredAt: image.createdAt.toISOString(),
        actorUserId: image.uploadedByUserId,
        data: { originalFileName: image.originalFileName, isPrimary: image.isPrimary },
      })),
      ...documents.map((document) => ({
        id: document.id,
        type: "document_uploaded" as const,
        occurredAt: document.createdAt.toISOString(),
        actorUserId: document.uploadedByUserId,
        data: {
          originalFileName: document.originalFileName,
          documentType: document.documentType,
          title: document.title,
        },
      })),
    ];

    return events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  /**
   * Generated summary shown at the top of the asset's Timeline page — see
   * docs/PRODUCT_BIBLE.md §12. revenueGeneratedMinor is computed read-time
   * via computeItemLineTotalMinor, the same pure pricing function Rentals
   * uses to price each line — never a separately stored/recomputed total.
   */
  async summary(tenantId: string, id: string): Promise<AssetSummary> {
    const asset = await this.findOne(tenantId, id);

    const rentalItems = await this.prisma.rentalItem.findMany({
      where: {
        tenantId,
        assetId: id,
        rental: { deletedAt: null, status: { in: COUNTED_RENTAL_STATUSES } },
      },
      select: {
        quantity: true,
        billingMode: true,
        dailyPriceMinor: true,
        weeklyPriceMinor: true,
        monthlyPriceMinor: true,
        customPriceMinor: true,
        discountMinor: true,
        monthlyBillingStrategy: true,
        customMonthLengthDays: true,
        rental: { select: { plannedStart: true, plannedEnd: true, currency: true } },
      },
    });

    const revenueGeneratedMinor = rentalItems.reduce(
      (sum, item) =>
        sum + computeItemLineTotalMinor(item, item.rental.plannedStart, item.rental.plannedEnd),
      0,
    );

    return {
      totalRentals: rentalItems.length,
      revenueGeneratedMinor,
      currency: rentalItems[0]?.rental.currency ?? null,
      currentStatus: {
        id: asset.currentStatus.id,
        code: asset.currentStatus.code,
        name: asset.currentStatus.name,
      },
      currentLocation: asset.currentLocationText,
    };
  }

  private async resolveDefaultStatusId(tenantId: string): Promise<string> {
    const available = await this.assetStatusesService.findByCode(tenantId, "AVAILABLE");
    if (!available) {
      throw new BadRequestException("No default status configured for this tenant");
    }
    return available.id;
  }

  private async assertCategoryBelongsToTenant(tenantId: string, categoryId: string): Promise<void> {
    const category = await this.prisma.assetCategory.findFirst({
      where: { id: categoryId, tenantId, deletedAt: null },
    });
    if (!category) {
      throw new NotFoundException("Category not found");
    }
  }

  private async assertStatusBelongsToTenant(tenantId: string, statusId: string): Promise<void> {
    const status = await this.prisma.assetStatusDefinition.findFirst({
      where: { id: statusId, tenantId, deletedAt: null },
    });
    if (!status) {
      throw new NotFoundException("Status not found");
    }
  }

  private assertMoneyPairing(
    minor: number | null | undefined,
    currency: string | null | undefined,
    minorField: string,
    currencyField: string,
  ): void {
    const hasMinor = minor !== null && minor !== undefined;
    const hasCurrency = currency !== null && currency !== undefined;
    if (hasMinor !== hasCurrency) {
      throw new BadRequestException(`${minorField} and ${currencyField} must be set together`);
    }
  }

  private async assertUnique(
    tenantId: string,
    field: "internalNumber" | "sku" | "serialNumber" | "barcode" | "qrCodeValue",
    value: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.asset.findFirst({
      where: {
        tenantId,
        [field]: value,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException(`An asset with this ${field} already exists`);
    }
  }

  private async buildCustomFieldFilterClauses(
    tenantId: string,
    filters: Record<string, unknown>,
  ): Promise<Prisma.AssetWhereInput[]> {
    const keys = Object.keys(filters);
    if (keys.length === 0) {
      return [];
    }

    const definitions = await this.prisma.assetCustomFieldDefinition.findMany({
      where: { tenantId, key: { in: keys }, isFilterable: true, deletedAt: null },
    });
    const byKey = new Map<string, AssetCustomFieldDefinition[]>();
    for (const definition of definitions) {
      const list = byKey.get(definition.key) ?? [];
      list.push(definition);
      byKey.set(definition.key, list);
    }

    const clauses: Prisma.AssetWhereInput[] = [];
    for (const key of keys) {
      const matchingDefinitions = byKey.get(key);
      if (!matchingDefinitions || matchingDefinitions.length === 0) {
        continue; // not a filterable field — silently ignored rather than erroring on an unknown filter key
      }
      clauses.push({
        customFieldValues: {
          some: {
            fieldDefinitionId: { in: matchingDefinitions.map((definition) => definition.id) },
            valueJson: { equals: filters[key] as never },
          },
        },
      });
    }
    return clauses;
  }
}
