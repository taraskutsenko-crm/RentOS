import { ConflictException, Injectable } from "@nestjs/common";
import type { RentalStatus } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";

/** Rental statuses that represent a confirmed claim on an asset for its planned window. */
const BLOCKING_STATUSES: RentalStatus[] = ["RESERVED", "ACTIVE"];

export interface AvailabilityConflict {
  rentalId: string;
  rentalNumber: string;
  plannedStart: string;
  plannedEnd: string;
}

export interface AssetAvailabilityResult {
  assetId: string;
  isAvailable: boolean;
  conflicts: AvailabilityConflict[];
}

/**
 * The single source of truth for "is this asset free for this date range."
 * Never relies on Asset.currentStatusId alone (a single status field can't
 * represent per-date-range availability for future reservations) — always
 * queries confirmed (RESERVED/ACTIVE) RentalItem rows directly. See
 * docs/adr/0006-rental-lifecycle-and-availability.md.
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
   * an asset immediately.
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

    const candidateItems = await this.prisma.rentalItem.findMany({
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
    });

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

    return assetIds.map((assetId) => ({
      assetId,
      isAvailable: !conflictsByAsset.has(assetId),
      conflicts: conflictsByAsset.get(assetId) ?? [],
    }));
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
}
