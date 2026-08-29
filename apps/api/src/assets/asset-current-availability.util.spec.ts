import { describe, expect, it } from "vitest";

import { deriveAssetCurrentAvailability } from "./asset-current-availability.util";
import type { AssetAvailabilityResult } from "../rentals/availability.service";

function freeResult(): AssetAvailabilityResult {
  return {
    assetId: "asset-1",
    isAvailable: true,
    conflicts: [],
    blocks: [],
    permanentReason: null,
  };
}

const CONFLICT = {
  rentalId: "rental-1",
  rentalNumber: "RNT-000001",
  plannedStart: "2026-08-01T00:00:00.000Z",
  plannedEnd: "2026-08-05T00:00:00.000Z",
  isOverdue: false,
  overdueSince: null,
};

const OVERDUE_CONFLICT = {
  ...CONFLICT,
  isOverdue: true,
  overdueSince: "2026-08-05T00:00:00.000Z",
};

function block(type: "MAINTENANCE" | "REPAIR" | "INSPECTION" | "RELOCATION" | "MANUAL_BLOCK") {
  return {
    blockId: "block-1",
    type,
    startAt: "2026-08-01T00:00:00.000Z",
    endAt: "2026-08-05T00:00:00.000Z",
    notes: null,
    relatedRentalId: null,
  };
}

describe("deriveAssetCurrentAvailability", () => {
  // A: an active rental right now (not overdue — still inside its planned window).
  it("is unavailable, reason RENTED, when the engine reports a current, non-overdue rental conflict", () => {
    const result: AssetAvailabilityResult = {
      ...freeResult(),
      isAvailable: false,
      conflicts: [CONFLICT],
    };
    expect(deriveAssetCurrentAvailability(true, result)).toEqual({
      isAvailableNow: false,
      unavailableReason: "RENTED",
      isOverdue: false,
      overdueSince: null,
    });
  });

  // B/C: future-only or past-only rentals never reach here as a conflict —
  // AvailabilityService.checkAvailableNow's own date filtering (see
  // availability.service.spec.ts) is what excludes them; once excluded, the
  // engine reports `isAvailable: true`, and this function must pass that
  // straight through as available now.
  it("is available when the engine reports no current conflicts or blocks (covers future-only/past-only rentals, which the engine already excluded)", () => {
    expect(deriveAssetCurrentAvailability(true, freeResult())).toEqual({
      isAvailableNow: true,
      unavailableReason: null,
      isOverdue: false,
      overdueSince: null,
    });
  });

  // Overdue return: plannedEnd already passed, rental never actually returned.
  it("is unavailable, reason OVERDUE_RETURN, when the engine reports an overdue conflict — never plain RENTED", () => {
    const result: AssetAvailabilityResult = {
      ...freeResult(),
      isAvailable: false,
      conflicts: [OVERDUE_CONFLICT],
    };
    expect(deriveAssetCurrentAvailability(true, result)).toEqual({
      isAvailableNow: false,
      unavailableReason: "OVERDUE_RETURN",
      isOverdue: true,
      overdueSince: "2026-08-05T00:00:00.000Z",
    });
  });

  // D: a current maintenance block.
  it("is unavailable, reason MAINTENANCE, for a current maintenance block", () => {
    const result: AssetAvailabilityResult = {
      ...freeResult(),
      isAvailable: false,
      blocks: [block("MAINTENANCE")],
    };
    expect(deriveAssetCurrentAvailability(true, result)).toEqual({
      isAvailableNow: false,
      unavailableReason: "MAINTENANCE",
      isOverdue: false,
      overdueSince: null,
    });
  });

  // E: a future maintenance block is available today — same reasoning as B/C:
  // the engine already excludes it, reporting `isAvailable: true`.
  it("is available today when a maintenance block only starts in the future (already excluded by the engine)", () => {
    expect(deriveAssetCurrentAvailability(true, freeResult())).toEqual({
      isAvailableNow: true,
      unavailableReason: null,
      isOverdue: false,
      overdueSince: null,
    });
  });

  it("is unavailable, reason REPAIR, for a current repair block", () => {
    const result: AssetAvailabilityResult = {
      ...freeResult(),
      isAvailable: false,
      blocks: [block("REPAIR")],
    };
    expect(deriveAssetCurrentAvailability(true, result).unavailableReason).toBe("REPAIR");
  });

  it("is unavailable, reason INSPECTION, for a current inspection block", () => {
    const result: AssetAvailabilityResult = {
      ...freeResult(),
      isAvailable: false,
      blocks: [block("INSPECTION")],
    };
    expect(deriveAssetCurrentAvailability(true, result).unavailableReason).toBe("INSPECTION");
  });

  it("is unavailable, reason RELOCATION, for a current relocation block", () => {
    const result: AssetAvailabilityResult = {
      ...freeResult(),
      isAvailable: false,
      blocks: [block("RELOCATION")],
    };
    expect(deriveAssetCurrentAvailability(true, result).unavailableReason).toBe("RELOCATION");
  });

  // F: a manual current block.
  it("is unavailable, reason MANUAL_BLOCK, for a current manual block", () => {
    const result: AssetAvailabilityResult = {
      ...freeResult(),
      isAvailable: false,
      blocks: [block("MANUAL_BLOCK")],
    };
    expect(deriveAssetCurrentAvailability(true, result)).toEqual({
      isAvailableNow: false,
      unavailableReason: "MANUAL_BLOCK",
      isOverdue: false,
      overdueSince: null,
    });
  });

  // G: LOST.
  it("is unavailable, reason LOST, for a permanently LOST asset", () => {
    const result: AssetAvailabilityResult = {
      ...freeResult(),
      isAvailable: false,
      permanentReason: "LOST",
    };
    expect(deriveAssetCurrentAvailability(true, result)).toEqual({
      isAvailableNow: false,
      unavailableReason: "LOST",
      isOverdue: false,
      overdueSince: null,
    });
  });

  // H: RETIRED.
  it("is unavailable, reason RETIRED, for a permanently RETIRED asset", () => {
    const result: AssetAvailabilityResult = {
      ...freeResult(),
      isAvailable: false,
      permanentReason: "RETIRED",
    };
    expect(deriveAssetCurrentAvailability(true, result)).toEqual({
      isAvailableNow: false,
      unavailableReason: "RETIRED",
      isOverdue: false,
      overdueSince: null,
    });
  });

  // I: configuration disabled (isRentable = false) overrides everything else,
  // even when the engine itself would report the asset as free.
  it("is unavailable, reason NOT_RENTABLE, when isRentable is false — regardless of engine result", () => {
    expect(deriveAssetCurrentAvailability(false, freeResult())).toEqual({
      isAvailableNow: false,
      unavailableReason: "NOT_RENTABLE",
      isOverdue: false,
      overdueSince: null,
    });
  });

  it("NOT_RENTABLE takes priority even when the engine also reports an overdue conflict", () => {
    const result: AssetAvailabilityResult = {
      ...freeResult(),
      isAvailable: false,
      conflicts: [OVERDUE_CONFLICT],
    };
    const derived = deriveAssetCurrentAvailability(false, result);
    expect(derived.unavailableReason).toBe("NOT_RENTABLE");
    expect(derived.isOverdue).toBe(false);
  });

  it("is unavailable, reason NOT_RENTABLE, when isRentable is false and no availability result exists yet", () => {
    expect(deriveAssetCurrentAvailability(false, undefined)).toEqual({
      isAvailableNow: false,
      unavailableReason: "NOT_RENTABLE",
      isOverdue: false,
      overdueSince: null,
    });
  });

  // J: no blocking intervals and rentable.
  it("is available when rentable and no availability result was found for the asset (treated as free)", () => {
    expect(deriveAssetCurrentAvailability(true, undefined)).toEqual({
      isAvailableNow: true,
      unavailableReason: null,
      isOverdue: false,
      overdueSince: null,
    });
  });
});
