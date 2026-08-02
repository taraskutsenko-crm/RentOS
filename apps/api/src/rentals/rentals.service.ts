import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  Asset,
  MonthlyBillingStrategy,
  Prisma,
  RentalItem,
  RentalStatus,
} from "@prisma/client";

import { AssetStatusesService } from "../asset-statuses/asset-statuses.service";
import { AssetsService } from "../assets/assets.service";
import { AuditService } from "../audit/audit.service";
import type { PaginatedResult } from "../customers/customers.service";
import { PrismaService } from "../prisma/prisma.service";
import { RentalBillingSettingsService } from "../rental-billing-settings/rental-billing-settings.service";
import type { EffectiveRentalBillingSettings } from "../rental-billing-settings/rental-billing-settings.types";
import { AvailabilityService } from "./availability.service";
import type { CreateRentalDto } from "./dto/create-rental.dto";
import type { QueryRentalsDto } from "./dto/query-rentals.dto";
import type { RentalItemDto } from "./dto/rental-item.dto";
import type { ReturnRentalDto } from "./dto/return-rental.dto";
import type { StatusActionDto } from "./dto/status-action.dto";
import type { UpdateRentalDto } from "./dto/update-rental.dto";
import { generateRentalNumber } from "./rental-numbering.util";
import { computeRentalTotals, type PricedRentalItemInput } from "./rental-pricing.util";
import {
  RENTAL_DETAIL_INCLUDE,
  type RentalDetailView,
  type RentalListItemView,
} from "./rental.types";
import type { RentalTimelineEvent } from "./timeline.types";

/**
 * A RentalItemDto (client input) whose MONTHLY-only billing-strategy
 * snapshot fields have already been resolved — either freshly stamped from
 * the tenant's current RentalBillingSettings (new/replaced items) or
 * carried over unchanged from an already-persisted RentalItem (unedited
 * items on a partial update). Never accepted directly from a client — see
 * docs/adr/0008-configurable-monthly-billing-strategies.md.
 */
type RentalItemSource = RentalItemDto & {
  monthlyBillingStrategy?: MonthlyBillingStrategy | null;
  customMonthLengthDays?: number | null;
};

/** Statuses in which the item list and planned dates may still be edited. */
const EDITABLE_STATUSES: RentalStatus[] = ["DRAFT", "QUOTE"];
/** Statuses in which a rental's plannedEnd may be pushed further out via extendPlannedEnd (TASK-0009). */
const EXTENDABLE_STATUSES: RentalStatus[] = ["RESERVED", "ACTIVE"];
/** Statuses whose record may be hard-removed (never RESERVED/ACTIVE/RETURNED/COMPLETED — those are real operational history). */
const DELETABLE_STATUSES: RentalStatus[] = ["DRAFT", "QUOTE", "CANCELLED"];
const CANCELLABLE_STATUSES: RentalStatus[] = ["DRAFT", "QUOTE", "RESERVED", "ACTIVE"];

@Injectable()
export class RentalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly availabilityService: AvailabilityService,
    private readonly assetStatusesService: AssetStatusesService,
    private readonly assetsService: AssetsService,
    private readonly rentalBillingSettingsService: RentalBillingSettingsService,
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    dto: CreateRentalDto,
  ): Promise<RentalDetailView> {
    const plannedStart = new Date(dto.plannedStart);
    const plannedEnd = new Date(dto.plannedEnd);
    this.assertDateOrder(plannedStart, plannedEnd);

    await this.assertCustomerBelongsToTenant(tenantId, dto.customerId);

    const currency = dto.currency ?? (await this.resolveTenantDefaultCurrency(tenantId));
    const items = dto.items ?? [];
    this.assertNoDuplicateAssets(items);
    if (items.length > 0) {
      await this.assertAssetsRentable(
        tenantId,
        items.map((item) => item.assetId),
      );
    }

    const billingSettings = await this.resolveBillingSettingsIfNeeded(tenantId, items);
    const pricedItems = withMonthlyBillingSettings(items, billingSettings);

    const { subtotalMinor, totalMinor } = computeRentalTotals(
      pricedItems.map(toPricedItemInput),
      plannedStart,
      plannedEnd,
      dto.discountMinor ?? 0,
      dto.taxMinor ?? 0,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const rentalNumber = await generateRentalNumber(tx, tenantId);

      const rental = await tx.rental.create({
        data: {
          tenantId,
          customerId: dto.customerId,
          rentalNumber,
          status: "DRAFT",
          plannedStart,
          plannedEnd,
          currency,
          discountMinor: dto.discountMinor ?? 0,
          taxMinor: dto.taxMinor ?? 0,
          subtotalMinor,
          totalMinor,
          notes: dto.notes ?? null,
          internalNotes: dto.internalNotes ?? null,
          createdByUserId: actorUserId,
        },
      });

      for (const item of pricedItems) {
        await tx.rentalItem.create({ data: toRentalItemCreateData(tenantId, rental.id, item) });
      }

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "rental.created",
          entityType: "Rental",
          entityId: rental.id,
          metadata: { rentalNumber: rental.rentalNumber, itemCount: items.length },
        },
        tx,
      );

      return rental;
    });

    return this.findOne(tenantId, created.id);
  }

  async findMany(
    tenantId: string,
    query: QueryRentalsDto,
  ): Promise<PaginatedResult<RentalListItemView>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.RentalWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.assetId ? { items: { some: { assetId: query.assetId } } } : {}),
      ...(query.plannedStartFrom || query.plannedStartTo
        ? {
            plannedStart: {
              ...(query.plannedStartFrom ? { gte: new Date(query.plannedStartFrom) } : {}),
              ...(query.plannedStartTo ? { lte: new Date(query.plannedStartTo) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { rentalNumber: { contains: query.search, mode: "insensitive" } },
              { customer: { firstName: { contains: query.search, mode: "insensitive" } } },
              { customer: { lastName: { contains: query.search, mode: "insensitive" } } },
              { customer: { company: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.rental.findMany({
        where,
        include: { customer: true, _count: { select: { items: true } } },
        orderBy: { [query.sortBy ?? "createdAt"]: query.sortDirection ?? "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.rental.count({ where }),
    ]);

    return {
      items: items.map(({ _count, ...rental }) => ({ ...rental, itemCount: _count.items })),
      total,
      page,
      pageSize,
    };
  }

  async findOne(tenantId: string, id: string): Promise<RentalDetailView> {
    const rental = await this.prisma.rental.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: RENTAL_DETAIL_INCLUDE,
    });
    if (!rental) {
      throw new NotFoundException("Rental not found");
    }
    return rental;
  }

  async update(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: UpdateRentalDto,
  ): Promise<RentalDetailView> {
    const current = await this.findOne(tenantId, id);

    const editingLockedFields =
      dto.items !== undefined || dto.plannedStart !== undefined || dto.plannedEnd !== undefined;
    if (editingLockedFields && !EDITABLE_STATUSES.includes(current.status)) {
      throw new ConflictException(
        "Items and planned dates can only be edited while the rental is a draft or quote",
      );
    }

    if (dto.customerId && dto.customerId !== current.customerId) {
      await this.assertCustomerBelongsToTenant(tenantId, dto.customerId);
    }

    const plannedStart = dto.plannedStart ? new Date(dto.plannedStart) : current.plannedStart;
    const plannedEnd = dto.plannedEnd ? new Date(dto.plannedEnd) : current.plannedEnd;
    this.assertDateOrder(plannedStart, plannedEnd);

    const items = dto.items ?? current.items.map(fromExistingItem);
    this.assertNoDuplicateAssets(items);
    if (dto.items !== undefined && items.length > 0) {
      await this.assertAssetsRentable(
        tenantId,
        items.map((item) => item.assetId),
      );
    }

    // Only a full item replacement re-reads the tenant's *current* billing
    // settings — an edit that leaves items untouched (e.g. just the notes or
    // discount) must keep each item's already-frozen strategy, never pick up
    // a tenant-wide settings change made after the rental was created (see
    // ADR 0008). `fromExistingItem` below already carries that frozen
    // snapshot forward for the untouched-items case.
    const billingSettings =
      dto.items !== undefined
        ? await this.resolveBillingSettingsIfNeeded(tenantId, dto.items)
        : null;
    const pricedItems: RentalItemSource[] =
      dto.items !== undefined ? withMonthlyBillingSettings(dto.items, billingSettings) : items;

    const effectiveDiscountMinor = dto.discountMinor ?? current.discountMinor;
    const effectiveTaxMinor = dto.taxMinor ?? current.taxMinor;
    const { subtotalMinor, totalMinor } = computeRentalTotals(
      pricedItems.map(toPricedItemInput),
      plannedStart,
      plannedEnd,
      effectiveDiscountMinor,
      effectiveTaxMinor,
    );

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.rental.updateMany({
        where: { id, tenantId, deletedAt: null },
        data: {
          ...(dto.customerId ? { customerId: dto.customerId } : {}),
          ...(dto.plannedStart ? { plannedStart } : {}),
          ...(dto.plannedEnd ? { plannedEnd } : {}),
          ...(dto.currency ? { currency: dto.currency } : {}),
          discountMinor: effectiveDiscountMinor,
          taxMinor: effectiveTaxMinor,
          subtotalMinor,
          totalMinor,
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.internalNotes !== undefined ? { internalNotes: dto.internalNotes } : {}),
          updatedByUserId: actorUserId,
        },
      });
      if (result.count === 0) {
        throw new NotFoundException("Rental not found");
      }

      if (dto.items !== undefined) {
        await tx.rentalItem.deleteMany({ where: { rentalId: id, tenantId } });
        for (const item of pricedItems) {
          await tx.rentalItem.create({ data: toRentalItemCreateData(tenantId, id, item) });
        }
      }

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "rental.updated",
          entityType: "Rental",
          entityId: id,
          metadata: { changedFields: Object.keys(dto) },
        },
        tx,
      );
    });

    return this.findOne(tenantId, id);
  }

  /**
   * Extends a RESERVED/ACTIVE rental's plannedEnd — genuinely distinct from
   * `update()`, which only permits editing dates while the rental is still
   * DRAFT/QUOTE (see EDITABLE_STATUSES). Introduced for TASK-0009's
   * customer-portal extension-request flow: PortalExtensionRequestsService
   * calls this when staff approves a request, so the actual date/pricing
   * change goes through the same pricing engine as every other rental
   * mutation rather than a duplicated calculation. Re-validates availability
   * for the newly-added tail window only (excluding this rental's own
   * claim) — the already-elapsed portion of the rental needs no re-check.
   */
  async extendPlannedEnd(
    tenantId: string,
    id: string,
    actorUserId: string | null,
    newPlannedEnd: Date,
  ): Promise<RentalDetailView> {
    const current = await this.findOne(tenantId, id);
    if (!EXTENDABLE_STATUSES.includes(current.status)) {
      throw new ConflictException(`Cannot extend a rental in ${current.status} status`);
    }
    if (newPlannedEnd <= current.plannedEnd) {
      throw new BadRequestException("The new planned end must be after the current planned end");
    }

    const assetIds = current.items.map((item) => item.assetId);
    await this.availabilityService.assertAvailable(
      tenantId,
      assetIds,
      current.plannedEnd,
      newPlannedEnd,
      id,
    );

    const items = current.items.map(fromExistingItem);
    const { subtotalMinor, totalMinor } = computeRentalTotals(
      items.map(toPricedItemInput),
      current.plannedStart,
      newPlannedEnd,
      current.discountMinor,
      current.taxMinor,
    );

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.rental.updateMany({
        where: { id, tenantId, deletedAt: null },
        data: {
          plannedEnd: newPlannedEnd,
          subtotalMinor,
          totalMinor,
          updatedByUserId: actorUserId,
        },
      });
      if (result.count === 0) {
        throw new NotFoundException("Rental not found");
      }

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "rental.extended",
          entityType: "Rental",
          entityId: id,
          metadata: {
            previousPlannedEnd: current.plannedEnd.toISOString(),
            newPlannedEnd: newPlannedEnd.toISOString(),
          },
        },
        tx,
      );
    });

    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string, actorUserId: string): Promise<void> {
    const current = await this.findOne(tenantId, id);
    if (!DELETABLE_STATUSES.includes(current.status)) {
      throw new ConflictException(
        `Cannot delete a rental in ${current.status} status — cancel it first if it must be removed`,
      );
    }

    const result = await this.prisma.rental.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException("Rental not found");
    }

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "rental.deleted",
      entityType: "Rental",
      entityId: id,
    });
  }

  async reserve(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: StatusActionDto,
  ): Promise<RentalDetailView> {
    const current = await this.findOne(tenantId, id);
    if (!EDITABLE_STATUSES.includes(current.status)) {
      throw new ConflictException(`Cannot reserve a rental in ${current.status} status`);
    }
    if (current.items.length === 0) {
      throw new BadRequestException("Cannot reserve a rental with no items");
    }

    const assetIds = current.items.map((item) => item.assetId);
    await this.assertAssetsRentable(tenantId, assetIds);
    await this.availabilityService.assertAvailable(
      tenantId,
      assetIds,
      current.plannedStart,
      current.plannedEnd,
      id,
    );

    await this.transitionStatus(tenantId, id, actorUserId, current.status, "RESERVED", dto.reason);
    return this.findOne(tenantId, id);
  }

  async start(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: StatusActionDto,
  ): Promise<RentalDetailView> {
    const current = await this.findOne(tenantId, id);
    if (current.status !== "RESERVED") {
      throw new ConflictException(`Cannot start a rental in ${current.status} status`);
    }

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.rental.updateMany({
        where: { id, tenantId, deletedAt: null },
        data: { status: "ACTIVE", actualStart: new Date(), updatedByUserId: actorUserId },
      });
      if (result.count === 0) {
        throw new NotFoundException("Rental not found");
      }
      await this.writeStatusHistory(
        tx,
        tenantId,
        id,
        actorUserId,
        current.status,
        "ACTIVE",
        dto.reason,
      );
      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "rental.status_changed",
          entityType: "Rental",
          entityId: id,
          metadata: { from: current.status, to: "ACTIVE" },
        },
        tx,
      );
    });

    await this.syncAssetStatuses(
      tenantId,
      actorUserId,
      current.items.map((item) => item.assetId),
      "RENTED",
      `Rental ${current.rentalNumber} started`,
    );

    return this.findOne(tenantId, id);
  }

  async returnRental(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: ReturnRentalDto,
  ): Promise<RentalDetailView> {
    const current = await this.findOne(tenantId, id);
    if (current.status !== "ACTIVE") {
      throw new ConflictException(`Cannot return a rental in ${current.status} status`);
    }

    const unreturned = current.items.filter((item) => !item.returnedAt);
    let targetItems = unreturned;
    if (dto.itemIds) {
      const validIds = new Set(current.items.map((item) => item.id));
      const unknown = dto.itemIds.filter((itemId) => !validIds.has(itemId));
      if (unknown.length > 0) {
        throw new BadRequestException(`Unknown rental item id(s): ${unknown.join(", ")}`);
      }
      targetItems = unreturned.filter((item) => dto.itemIds!.includes(item.id));
    }
    if (targetItems.length === 0) {
      throw new BadRequestException("No unreturned items to return");
    }

    const now = new Date();
    const willBeFullyReturned = targetItems.length === unreturned.length;

    await this.prisma.$transaction(async (tx) => {
      await tx.rentalItem.updateMany({
        where: { tenantId, rentalId: id, id: { in: targetItems.map((item) => item.id) } },
        data: { returnedAt: now },
      });

      if (willBeFullyReturned) {
        await tx.rental.updateMany({
          where: { id, tenantId, deletedAt: null },
          data: { status: "RETURNED", actualEnd: now, updatedByUserId: actorUserId },
        });
        await this.writeStatusHistory(
          tx,
          tenantId,
          id,
          actorUserId,
          current.status,
          "RETURNED",
          dto.reason,
        );
      }

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "rental.returned",
          entityType: "Rental",
          entityId: id,
          metadata: {
            itemIds: targetItems.map((item) => item.id),
            assetIds: targetItems.map((item) => item.assetId),
            fullyReturned: willBeFullyReturned,
          },
        },
        tx,
      );
    });

    await this.syncAssetStatuses(
      tenantId,
      actorUserId,
      targetItems.map((item) => item.assetId),
      "AVAILABLE",
      `Returned from rental ${current.rentalNumber}`,
    );

    return this.findOne(tenantId, id);
  }

  async cancel(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: StatusActionDto,
  ): Promise<RentalDetailView> {
    const current = await this.findOne(tenantId, id);
    if (!CANCELLABLE_STATUSES.includes(current.status)) {
      throw new ConflictException(`Cannot cancel a rental in ${current.status} status`);
    }

    const wasActive = current.status === "ACTIVE";
    const itemsToRelease = wasActive ? current.items.filter((item) => !item.returnedAt) : [];
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      if (itemsToRelease.length > 0) {
        await tx.rentalItem.updateMany({
          where: { tenantId, rentalId: id, id: { in: itemsToRelease.map((item) => item.id) } },
          data: { returnedAt: now },
        });
      }

      const result = await tx.rental.updateMany({
        where: { id, tenantId, deletedAt: null },
        data: {
          status: "CANCELLED",
          ...(wasActive ? { actualEnd: now } : {}),
          updatedByUserId: actorUserId,
        },
      });
      if (result.count === 0) {
        throw new NotFoundException("Rental not found");
      }

      await this.writeStatusHistory(
        tx,
        tenantId,
        id,
        actorUserId,
        current.status,
        "CANCELLED",
        dto.reason,
      );
      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "rental.status_changed",
          entityType: "Rental",
          entityId: id,
          metadata: { from: current.status, to: "CANCELLED" },
        },
        tx,
      );
    });

    if (itemsToRelease.length > 0) {
      await this.syncAssetStatuses(
        tenantId,
        actorUserId,
        itemsToRelease.map((item) => item.assetId),
        "AVAILABLE",
        `Rental ${current.rentalNumber} cancelled`,
      );
    }

    return this.findOne(tenantId, id);
  }

  /** Combines creation, updates, status changes, and returns into one chronological (oldest first) feed. */
  async timeline(tenantId: string, id: string): Promise<RentalTimelineEvent[]> {
    const rental = await this.findOne(tenantId, id);

    const [updateLogs, returnLogs, statusHistory] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { tenantId, entityType: "Rental", entityId: id, action: "rental.updated" },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.auditLog.findMany({
        where: { tenantId, entityType: "Rental", entityId: id, action: "rental.returned" },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.rentalStatusHistory.findMany({
        where: { tenantId, rentalId: id },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const events: RentalTimelineEvent[] = [
      {
        id: `created-${rental.id}`,
        type: "created",
        occurredAt: rental.createdAt.toISOString(),
        actorUserId: rental.createdByUserId,
        data: { rentalNumber: rental.rentalNumber, customerId: rental.customerId },
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
        data: { fromStatus: entry.fromStatus, toStatus: entry.toStatus, reason: entry.reason },
      })),
      ...returnLogs.map((log) => ({
        id: log.id,
        type: "items_returned" as const,
        occurredAt: log.createdAt.toISOString(),
        actorUserId: log.userId,
        data: (log.metadata as Record<string, unknown> | null) ?? {},
      })),
    ];

    return events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  private async transitionStatus(
    tenantId: string,
    id: string,
    actorUserId: string,
    fromStatus: RentalStatus,
    toStatus: RentalStatus,
    reason: string | null | undefined,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.rental.updateMany({
        where: { id, tenantId, deletedAt: null },
        data: { status: toStatus, updatedByUserId: actorUserId },
      });
      if (result.count === 0) {
        throw new NotFoundException("Rental not found");
      }
      await this.writeStatusHistory(tx, tenantId, id, actorUserId, fromStatus, toStatus, reason);
      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "rental.status_changed",
          entityType: "Rental",
          entityId: id,
          metadata: { from: fromStatus, to: toStatus },
        },
        tx,
      );
    });
  }

  private writeStatusHistory(
    tx: Prisma.TransactionClient,
    tenantId: string,
    rentalId: string,
    changedByUserId: string,
    fromStatus: RentalStatus,
    toStatus: RentalStatus,
    reason: string | null | undefined,
  ) {
    return tx.rentalStatusHistory.create({
      data: { tenantId, rentalId, fromStatus, toStatus, changedByUserId, reason: reason ?? null },
    });
  }

  /**
   * Best-effort side effect, not transactionally coupled to the rental
   * state machine (see docs/adr/0006-rental-lifecycle-and-availability.md):
   * reflects an asset's current physical custody in its own status field
   * when a rental starts/returns/cancels. The availability engine itself
   * never depends on this — it always queries RentalItem rows directly.
   */
  private async syncAssetStatuses(
    tenantId: string,
    actorUserId: string,
    assetIds: string[],
    statusCode: "RENTED" | "AVAILABLE",
    reason: string,
  ): Promise<void> {
    const status = await this.assetStatusesService.findByCode(tenantId, statusCode);
    if (!status) {
      return;
    }
    for (const assetId of assetIds) {
      await this.assetsService.changeStatus(tenantId, assetId, actorUserId, {
        statusId: status.id,
        reason,
      });
    }
  }

  private async assertCustomerBelongsToTenant(tenantId: string, customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
  }

  private assertNoDuplicateAssets(items: { assetId: string }[]): void {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.assetId)) {
        throw new BadRequestException(`Duplicate asset in rental items: ${item.assetId}`);
      }
      seen.add(item.assetId);
    }
  }

  private assertDateOrder(plannedStart: Date, plannedEnd: Date): void {
    if (plannedEnd <= plannedStart) {
      throw new BadRequestException("plannedEnd must be after plannedStart");
    }
  }

  private async assertAssetsRentable(tenantId: string, assetIds: string[]): Promise<Asset[]> {
    const uniqueIds = [...new Set(assetIds)];
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: uniqueIds }, tenantId, deletedAt: null },
    });
    const foundIds = new Set(assets.map((asset) => asset.id));
    const missing = uniqueIds.filter((assetId) => !foundIds.has(assetId));
    if (missing.length > 0) {
      throw new NotFoundException(`Asset(s) not found in this tenant: ${missing.join(", ")}`);
    }
    const notRentable = assets.filter((asset) => !asset.isActive || !asset.isRentable);
    if (notRentable.length > 0) {
      throw new BadRequestException(
        `Asset(s) not available for rental (inactive or not rentable): ${notRentable.map((asset) => asset.internalNumber).join(", ")}`,
      );
    }
    return assets;
  }

  private async resolveTenantDefaultCurrency(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultCurrency: true },
    });
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }
    return tenant.defaultCurrency;
  }

  /** Only queries RentalBillingSettings when at least one item actually needs it. */
  private async resolveBillingSettingsIfNeeded(
    tenantId: string,
    items: { billingMode: RentalItemDto["billingMode"] }[],
  ): Promise<EffectiveRentalBillingSettings | null> {
    if (!items.some((item) => item.billingMode === "MONTHLY")) {
      return null;
    }
    return this.rentalBillingSettingsService.getEffective(tenantId);
  }
}

/**
 * Stamps the tenant's current monthly billing settings onto every MONTHLY
 * item — this is the one place a fresh (client-submitted) item list picks up
 * `monthlyBillingStrategy`/`customMonthLengthDays`; the client itself never
 * sends these fields (see RentalItemSource).
 */
function withMonthlyBillingSettings(
  items: RentalItemDto[],
  settings: EffectiveRentalBillingSettings | null,
): RentalItemSource[] {
  return items.map((item) => {
    if (item.billingMode !== "MONTHLY") {
      return item;
    }
    return {
      ...item,
      monthlyBillingStrategy: settings!.monthlyBillingStrategy,
      customMonthLengthDays: settings!.customMonthLengthDays,
    };
  });
}

function toPricedItemInput(item: RentalItemSource): PricedRentalItemInput {
  return {
    billingMode: item.billingMode,
    quantity: item.quantity ?? 1,
    dailyPriceMinor: item.dailyPriceMinor ?? null,
    weeklyPriceMinor: item.weeklyPriceMinor ?? null,
    monthlyPriceMinor: item.monthlyPriceMinor ?? null,
    customPriceMinor: item.customPriceMinor ?? null,
    discountMinor: item.discountMinor ?? 0,
    monthlyBillingStrategy: item.monthlyBillingStrategy ?? null,
    customMonthLengthDays: item.customMonthLengthDays ?? null,
  };
}

function fromExistingItem(item: RentalItem): RentalItemSource {
  return {
    assetId: item.assetId,
    quantity: item.quantity,
    billingMode: item.billingMode,
    ...(item.dailyPriceMinor !== null ? { dailyPriceMinor: item.dailyPriceMinor } : {}),
    ...(item.weeklyPriceMinor !== null ? { weeklyPriceMinor: item.weeklyPriceMinor } : {}),
    ...(item.monthlyPriceMinor !== null ? { monthlyPriceMinor: item.monthlyPriceMinor } : {}),
    ...(item.customPriceMinor !== null ? { customPriceMinor: item.customPriceMinor } : {}),
    depositMinor: item.depositMinor,
    discountMinor: item.discountMinor,
    notes: item.notes,
    monthlyBillingStrategy: item.monthlyBillingStrategy,
    customMonthLengthDays: item.customMonthLengthDays,
  };
}

function toRentalItemCreateData(
  tenantId: string,
  rentalId: string,
  item: RentalItemSource,
): Prisma.RentalItemUncheckedCreateInput {
  return {
    tenantId,
    rentalId,
    assetId: item.assetId,
    quantity: item.quantity ?? 1,
    billingMode: item.billingMode,
    dailyPriceMinor: item.dailyPriceMinor ?? null,
    weeklyPriceMinor: item.weeklyPriceMinor ?? null,
    monthlyPriceMinor: item.monthlyPriceMinor ?? null,
    customPriceMinor: item.customPriceMinor ?? null,
    depositMinor: item.depositMinor ?? 0,
    discountMinor: item.discountMinor ?? 0,
    notes: item.notes ?? null,
    monthlyBillingStrategy:
      item.billingMode === "MONTHLY" ? (item.monthlyBillingStrategy ?? null) : null,
    customMonthLengthDays:
      item.billingMode === "MONTHLY" ? (item.customMonthLengthDays ?? null) : null,
  };
}
