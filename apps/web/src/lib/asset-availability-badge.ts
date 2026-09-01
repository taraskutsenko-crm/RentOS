import type { AssetAvailabilityBlockType, AssetAvailabilityResult } from "../types/rental";

/**
 * One shared "why is this asset unavailable" summary, used everywhere an
 * asset selector, the Asset detail Availability section, or the Calendar
 * needs to show a reason — never just a color, per the product requirement
 * that unavailable assets stay visible with text + icon + dates. Picks the
 * single most relevant conflict from AvailabilityService's structured
 * result (permanent LOST/RETIRED first, then an active rental claim, then
 * the soonest availability block) rather than listing every conflict, since
 * this is meant for a compact inline badge, not a full report.
 */
export type AvailabilityBadgeKind =
  "RENTAL_CONFLICT" | AssetAvailabilityBlockType | "LOST" | "RETIRED";

export interface AvailabilityBadgeInfo {
  kind: AvailabilityBadgeKind;
  /** i18n key under `asset.availability.*` for the short status label. */
  labelKey: string;
  /** Rental number or block notes, empty when there's nothing more specific to show. */
  reference: string;
  /** ISO datetime, or null for a permanent (LOST/RETIRED) reason. */
  startAt: string | null;
  endAt: string | null;
  /** Set for a RENTAL_CONFLICT — lets a caller link straight to the conflicting rental. */
  rentalId?: string;
  /**
   * True only for a RENTAL_CONFLICT whose blocking rental is itself
   * OVERDUE_RETURN (see rental-attention.util.ts, backend) — the asset is
   * physically still with the previous customer, not "available once
   * plannedEnd passes." The badge must say so explicitly, never imply
   * availability resumes at `endAt`.
   */
  isOverdueConflict?: boolean;
}

const BLOCK_LABEL_KEYS: Record<AssetAvailabilityBlockType, string> = {
  MAINTENANCE: "asset.availability.maintenance",
  REPAIR: "asset.availability.repair",
  INSPECTION: "asset.availability.inspection",
  RELOCATION: "asset.availability.relocation",
  MANUAL_BLOCK: "asset.availability.manualBlock",
};

/**
 * Same idea as pickAvailabilityBadge, but scoped to a single calendar day —
 * used by the Availability Calendar, where each cell needs its own reason
 * rather than the asset's single overall status. Returns null for a free day.
 */
export function pickAvailabilityBadgeForDay(
  result: AssetAvailabilityResult | undefined | null,
  day: Date,
): AvailabilityBadgeInfo | null {
  if (!result) return null;

  if (result.permanentReason) {
    return {
      kind: result.permanentReason,
      labelKey: `asset.availability.${result.permanentReason.toLowerCase()}`,
      reference: "",
      startAt: null,
      endAt: null,
    };
  }

  const rentalConflict = result.conflicts.find((conflict) => {
    const start = new Date(conflict.plannedStart);
    const end = new Date(conflict.plannedEnd);
    return day >= start && day < end;
  });
  if (rentalConflict) {
    return {
      kind: "RENTAL_CONFLICT",
      labelKey: rentalConflict.isOverdue
        ? "asset.availability.rentalConflictOverdue"
        : "asset.availability.rentalConflict",
      reference: rentalConflict.rentalNumber,
      startAt: rentalConflict.plannedStart,
      endAt: rentalConflict.plannedEnd,
      rentalId: rentalConflict.rentalId,
      isOverdueConflict: rentalConflict.isOverdue,
    };
  }

  const block = result.blocks.find((candidate) => {
    const start = new Date(candidate.startAt);
    const end = new Date(candidate.endAt);
    return day >= start && day < end;
  });
  if (block) {
    return {
      kind: block.type,
      labelKey: BLOCK_LABEL_KEYS[block.type],
      reference: block.notes ?? "",
      startAt: block.startAt,
      endAt: block.endAt,
    };
  }

  return null;
}

export function pickAvailabilityBadge(
  result: AssetAvailabilityResult | undefined | null,
): AvailabilityBadgeInfo | null {
  if (!result || result.isAvailable) return null;

  if (result.permanentReason) {
    return {
      kind: result.permanentReason,
      labelKey: `asset.availability.${result.permanentReason.toLowerCase()}`,
      reference: "",
      startAt: null,
      endAt: null,
    };
  }

  // An overdue conflict is the most operationally urgent thing to surface
  // — prefer it over an ordinary (still-on-track) conflict when both exist,
  // rather than picking `conflicts[0]` unconditionally, since "physically
  // still with the previous customer" outranks "booked but not yet begun."
  const rentalConflict =
    result.conflicts.find((conflict) => conflict.isOverdue) ?? result.conflicts[0];
  if (rentalConflict) {
    return {
      kind: "RENTAL_CONFLICT",
      labelKey: rentalConflict.isOverdue
        ? "asset.availability.rentalConflictOverdue"
        : "asset.availability.rentalConflict",
      reference: rentalConflict.rentalNumber,
      startAt: rentalConflict.plannedStart,
      endAt: rentalConflict.plannedEnd,
      rentalId: rentalConflict.rentalId,
      isOverdueConflict: rentalConflict.isOverdue,
    };
  }

  const block = result.blocks[0];
  if (block) {
    return {
      kind: block.type,
      labelKey: BLOCK_LABEL_KEYS[block.type],
      reference: block.notes ?? "",
      startAt: block.startAt,
      endAt: block.endAt,
    };
  }

  return null;
}
