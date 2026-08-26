import { ConflictException, Injectable } from "@nestjs/common";
import type { AssetAvailabilityBlockType, RentalStatus } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";

/** Rental statuses that represent a confirmed claim on an asset for its planned window. */
const BLOCKING_STATUSES: RentalStatus[] = ["RESERVED", "ACTIVE"];

/** Asset status codes that make an asset unavailable regardless of date range. */
const PERMANENT_BLOCK_STATUS_CODES = ["LOST", "RETIRED"] as const;
type PermanentBlockReason = (typeof PERMANENT_BLOCK_STATUS_CODES)[number];

export interface AvailabilityConflict {
  rentalId: string;
  rentalNumber: string;
  plannedStart: string;
  plannedEnd: string;
}

/** A non-rental reason an asset is blocked out for a date range — see AssetAvailabilityBlock. */
export interface AvailabilityBlockConflict {
  blockId: string;
  type: AssetAvailabilityBlockType;
  startAt: string;
  endAt: string;
  notes: string | null;
  relatedRentalId: string | null;
}

export interface AssetAvailabilityResult {
  assetId: string;
  isAvailable: boolean;
  /** RESERVED/ACTIVE rental conflicts — unchanged shape, existing callers keep working untouched. */
  conflicts: AvailabilityConflict[];
  /** Maintenance/repair/inspection/relocation/manual-block conflicts. */
  blocks: AvailabilityBlockConflict[];
  /** Set when the asset's *global* status is LOST/RETIRED — unavailable for every date, not just this range. */
  permanentReason: PermanentBlockReason | null;
}

/**
 * The single source of truth for "is this asset free for this date range."
 * Never relies on Asset.currentStatusId alone for date-scoped decisions (a
 * single status field can't represent per-date-range availability for
 * future reservations or future maintenance) — always queries confirmed
 * (RESERVED/ACTIVE) RentalItem rows and AssetAvailabilityBlock rows
 * directly, unioning both into one structured result. The one exception is
 * LOST/RETIRED: those are treated as permanent, date-independent
 * unavailability, since a lost or retired asset can never be booked for any
 * future date either. See docs/adr/0006-rental-lifecycle-and-availability.md.
 */
@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * For each assetId, reports whether it's free for [plannedStart, plannedEnd)
   * — a half-open interval, so a rental ending exactly when another begins
   * does not conflict (same-day turnover is allowed). `excludeRentalId`
   * lets an in-progress edit check availability without conflicting with
   * itself. An item that was returned early (`returnedAt` set) stops
   * blocking from that moment on, even if the rental's overall planned
   * window hasn't ended yet — this is what makes partial returns free up
   * an asset immediately. AssetAvailabilityBlock rows use the same
   * half-open convention (`startAt <= x < endAt`); cancelled blocks
   * (`cancelledAt` set) are always excluded.
   */
  async checkAvailability(
    tenantId: string,
    assetIds: string[],
    plannedStart: Date,
    plannedEnd: Date,
    excludeRentalId?: string,
  ): Promise<AssetAvailabilityResult[]> {
    if (assetIds.length === 0) {
      return [];
    }

    const [candidateItems, candidateBlocks, assets] = await Promise.all([
      this.prisma.rentalItem.findMany({
        where: {
          tenantId,
          assetId: { in: assetIds },
          rental: {
            status: { in: BLOCKING_STATUSES },
            deletedAt: null,
            plannedStart: { lt: plannedEnd },
            ...(excludeRentalId ? { id: { not: excludeRentalId } } : {}),
          },
        },
        include: { rental: true },
      }),
      this.prisma.assetAvailabilityBlock.findMany({
        where: {
          tenantId,
          assetId: { in: assetIds },
          cancelledAt: null,
          startAt: { lt: plannedEnd },
          endAt: { gt: plannedStart },
        },
      }),
      this.prisma.asset.findMany({
        where: { tenantId, id: { in: assetIds } },
        select: { id: true, currentStatus: { select: { code: true, isSystem: true } } },
      }),
    ]);

    const conflictsByAsset = new Map<string, AvailabilityConflict[]>();
    for (const item of candidateItems) {
      const effectiveEnd = item.returnedAt ?? item.rental.plannedEnd;
      if (effectiveEnd <= plannedStart) {
        continue; // returned/ended before the requested window starts — no conflict
      }
      const list = conflictsByAsset.get(item.assetId) ?? [];
      list.push({
        rentalId: item.rental.id,
        rentalNumber: item.rental.rentalNumber,
        plannedStart: item.rental.plannedStart.toISOString(),
        plannedEnd: item.rental.plannedEnd.toISOString(),
      });
      conflictsByAsset.set(item.assetId, list);
    }

    const blocksByAsset = new Map<string, AvailabilityBlockConflict[]>();
    for (const block of candidateBlocks) {
      const list = blocksByAsset.get(block.assetId) ?? [];
      list.push({
        blockId: block.id,
        type: block.type,
        startAt: block.startAt.toISOString(),
        endAt: block.endAt.toISOString(),
        notes: block.notes,
        relatedRentalId: block.relatedRentalId,
      });
      blocksByAsset.set(block.assetId, list);
    }

    const permanentReasonByAsset = new Map<string, PermanentBlockReason>();
    for (const asset of assets) {
      const code = asset.currentStatus?.code;
      if (asset.currentStatus?.isSystem && isPermanentBlockReason(code)) {
        permanentReasonByAsset.set(asset.id, code);
      }
    }

    return assetIds.map((assetId) => {
      const conflicts = conflictsByAsset.get(assetId) ?? [];
      const blocks = blocksByAsset.get(assetId) ?? [];
      const permanentReason = permanentReasonByAsset.get(assetId) ?? null;
      return {
        assetId,
        isAvailable: conflicts.length === 0 && blocks.length === 0 && permanentReason === null,
        conflicts,
        blocks,
        permanentReason,
      };
    });
  }

  /** Throws ConflictException listing every unavailable asset, or resolves silently if all are free. */
  async assertAvailable(
    tenantId: string,
    assetIds: string[],
    plannedStart: Date,
    plannedEnd: Date,
    excludeRentalId?: string,
  ): Promise<void> {
    const results = await this.checkAvailability(
      tenantId,
      assetIds,
      plannedStart,
      plannedEnd,
      excludeRentalId,
    );
    const unavailable = results.filter((result) => !result.isAvailable);
    if (unavailable.length > 0) {
      throw new ConflictException(
        `The following assets are not available for the selected dates: ${unavailable
          .map((result) => result.assetId)
          .join(", ")}`,
      );
    }
  }

  /**
   * Same rule AssetAvailabilityBlocksService uses to reject an overlapping
   * new block: any existing non-cancelled block of the same asset whose
   * window intersects [startAt, endAt) is a hard conflict, no override.
   * Exposed here (not duplicated) since it's the same half-open interval
   * math as checkAvailability, just scoped to blocks only and without the
   * rental/permanent-status lookups a block-creation check doesn't need.
   */
  async findOverlappingBlocks(
    tenantId: string,
    assetId: string,
    startAt: Date,
    endAt: Date,
    excludeBlockId?: string,
  ) {
    return this.prisma.assetAvailabilityBlock.findMany({
      where: {
        tenantId,
        assetId,
        cancelledAt: null,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        ...(excludeBlockId ? { id: { not: excludeBlockId } } : {}),
      },
    });
  }
}

function isPermanentBlockReason(code: string | undefined): code is PermanentBlockReason {
  return !!code && (PERMANENT_BLOCK_STATUS_CODES as readonly string[]).includes(code);
}
