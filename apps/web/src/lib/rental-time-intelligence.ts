import type { RentalStatus } from "../types/rental";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type RentalTimeIntelligenceKind =
  | "starts_today"
  | "starts_tomorrow"
  | "starts_in_days"
  | "days_remaining"
  | "due_today"
  | "overdue"
  | "completed"
  | "cancelled"
  | "none";

export interface RentalTimeIntelligence {
  kind: RentalTimeIntelligenceKind;
  days: number;
}

function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function daysBetween(fromMs: number, toMs: number): number {
  return Math.round((startOfLocalDay(toMs) - startOfLocalDay(fromMs)) / MS_PER_DAY);
}

function relativeToEnd(nowMs: number, plannedEnd: string): RentalTimeIntelligence {
  const daysUntilEnd = daysBetween(nowMs, new Date(plannedEnd).getTime());
  if (daysUntilEnd > 0) return { kind: "days_remaining", days: daysUntilEnd };
  if (daysUntilEnd === 0) return { kind: "due_today", days: 0 };
  return { kind: "overdue", days: Math.abs(daysUntilEnd) };
}

/**
 * Pure, deterministic derivation of a rental's time-intelligence label from
 * its status and planned dates — never a persisted value, computed fresh on
 * every render. Centralized here per docs/UI_REDESIGN_PLAN.md Chapter 7 so
 * no component duplicates this date math. `plannedStart`/`plannedEnd` are
 * ISO strings (Rental.plannedStart/plannedEnd); `nowMs` must be captured
 * once by the caller (e.g. a lazy useState initializer) since Date.now()
 * cannot be called during render.
 */
export function getRentalTimeIntelligence(
  status: RentalStatus,
  plannedStart: string,
  plannedEnd: string,
  nowMs: number,
): RentalTimeIntelligence {
  if (status === "CANCELLED") return { kind: "cancelled", days: 0 };
  if (status === "RETURNED" || status === "COMPLETED") return { kind: "completed", days: 0 };

  if (status === "ACTIVE") {
    return relativeToEnd(nowMs, plannedEnd);
  }

  // DRAFT / QUOTE / RESERVED — not yet started.
  const daysUntilStart = daysBetween(nowMs, new Date(plannedStart).getTime());
  if (daysUntilStart > 1) return { kind: "starts_in_days", days: daysUntilStart };
  if (daysUntilStart === 1) return { kind: "starts_tomorrow", days: 1 };
  if (daysUntilStart === 0) return { kind: "starts_today", days: 0 };

  // Planned start has already passed but the rental never transitioned to
  // ACTIVE (e.g. a late pickup) — fall back to comparing against the end.
  return relativeToEnd(nowMs, plannedEnd);
}
