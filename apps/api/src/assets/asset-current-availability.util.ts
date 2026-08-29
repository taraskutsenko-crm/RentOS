import type { AssetAvailabilityBlockType } from "@prisma/client";

import type { AssetAvailabilityResult } from "../rentals/availability.service";

/**
 * Why an asset is not available right now — mirrors every reason the
 * canonical availability engine (AvailabilityService) already recognizes,
 * plus the one purely-configuration reason it doesn't (`NOT_RENTABLE`,
 * from `Asset.isRentable`). Never a new blocking rule — a display-layer
 * label over facts the engine (or the asset's own configuration) already
 * computed.
 */
export type AssetUnavailableReason =
  "NOT_RENTABLE" | "RENTED" | "LOST" | "RETIRED" | AssetAvailabilityBlockType;

export interface AssetCurrentAvailability {
  isAvailableNow: boolean;
  unavailableReason: AssetUnavailableReason | null;
}

/**
 * Combines the asset-level rental-enabled configuration flag
 * (`Asset.isRentable` — a business decision an owner makes, never
 * calculated) with the canonical availability engine's result for "right
 * now" (`AvailabilityService.checkAvailableNow` — a fact derived from real
 * RentalItem/AssetAvailabilityBlock rows and the asset's LOST/RETIRED
 * status, never persisted or overwritten) into the single "is this asset
 * actually available for rent at this moment" the Assets list displays.
 * See docs/adr/0006-rental-lifecycle-and-availability.md.
 *
 * The two inputs are deliberately kept separate everywhere except here —
 * this function is the only place they're merged, and only for display;
 * neither input is ever written back based on the other.
 */
export function deriveAssetCurrentAvailability(
  isRentable: boolean,
  availability: AssetAvailabilityResult | undefined,
): AssetCurrentAvailability {
  if (!isRentable) {
    return { isAvailableNow: false, unavailableReason: "NOT_RENTABLE" };
  }
  if (!availability || availability.isAvailable) {
    return { isAvailableNow: true, unavailableReason: null };
  }
  if (availability.permanentReason) {
    return { isAvailableNow: false, unavailableReason: availability.permanentReason };
  }
  if (availability.conflicts.length > 0) {
    return { isAvailableNow: false, unavailableReason: "RENTED" };
  }
  if (availability.blocks.length > 0) {
    return { isAvailableNow: false, unavailableReason: availability.blocks[0]!.type };
  }
  // Defensive fallback — checkAvailability's isAvailable is always false
  // for one of the reasons above, so this should be unreachable. Stay
  // honest (unavailable, unexplained) rather than ever claiming available
  // when the engine said otherwise.
  return { isAvailableNow: false, unavailableReason: null };
}
