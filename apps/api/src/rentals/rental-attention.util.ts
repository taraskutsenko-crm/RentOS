import { Temporal } from "@js-temporal/polyfill";
import type { RentalStatus } from "@prisma/client";

import { tenantLocalToUtc } from "@rentos/shared";

import { deriveOverdueStatus, type OverdueRentalItemInput } from "./rental-overdue.util";

/**
 * Havelio Rental Attention System — the one canonical classification of
 * "does this rental need staff attention right now, and why." Deliberately
 * built as a pure derived read, never a stored/persisted status: an ACTIVE
 * rental never auto-transitions to RETURNED just because `plannedEnd` has
 * passed (see docs/DECISIONS.md and docs/adr/0006) — "overdue return" is an
 * attention flag layered on top of the unchanged ACTIVE status, exactly
 * like `deriveOverdueStatus` already established for the boolean case.
 *
 * The three categories are mutually exclusive and evaluated in this exact
 * precedence order — a rental whose plannedEnd was earlier *today* but has
 * already passed is OVERDUE_RETURN, never ENDING_TODAY (see the worked
 * example in docs/PRODUCT_BIBLE.md):
 *
 *   OVERDUE_RETURN    — ACTIVE, plannedEnd < now, an item still unreturned.
 *   ENDING_TODAY      — ACTIVE, plannedEnd > now, and plannedEnd falls on
 *                       today's tenant-local calendar date.
 *   ENDING_TOMORROW   — ACTIVE, plannedEnd falls on tomorrow's tenant-local
 *                       calendar date (always still in the future).
 *
 * RESERVED/DRAFT/QUOTE never take custody, so none of these ever apply to
 * them (mirrors deriveOverdueStatus's own rule). RETURNED/CANCELLED/
 * COMPLETED are terminal — never flagged either.
 */
export type RentalAttentionCategory = "OVERDUE_RETURN" | "ENDING_TODAY" | "ENDING_TOMORROW";

export interface RentalAttentionInput {
  status: RentalStatus;
  plannedEnd: Date;
}

export interface RentalAttention {
  category: RentalAttentionCategory | null;
  /** Set only when category is OVERDUE_RETURN — always the rental's own plannedEnd, the exact instant it became overdue (see deriveOverdueStatus). */
  overdueSince: Date | null;
}

/** The tenant-local calendar-day boundaries (as real UTC instants) attention classification and querying are evaluated against — computed once per request, never per-rental, so every rental in the same list is judged against an identical "today." */
export interface TenantDayBoundaries {
  now: Date;
  todayStart: Date;
  tomorrowStart: Date;
  dayAfterTomorrowStart: Date;
}

/**
 * Resolves "today"/"tomorrow" in the tenant's own IANA timezone — never the
 * server's or the browser's — using the same DST-safe `Temporal` conversion
 * layer (`tenantLocalToUtc`) every other tenant-local date computation in
 * this codebase already uses (Havelio Time Model, D-115).
 */
export function resolveTenantDayBoundaries(
  timezone: string,
  now: Date = new Date(),
): TenantDayBoundaries {
  // Derived from the `now` instant itself (via Temporal.Instant, not
  // Temporal.Now) — unlike a couple of other tenant-local "today" call
  // sites in this codebase, this one must be fully deterministic given its
  // `now` argument: the same instant must always resolve to the same
  // tenant-local calendar day, whether it's the real current moment or a
  // fixed instant a test passes in (Warsaw/New York DST-boundary tests
  // below rely on this).
  const today = Temporal.Instant.fromEpochMilliseconds(now.getTime())
    .toZonedDateTimeISO(timezone)
    .toPlainDate();
  const toStart = (pd: Temporal.PlainDate): Date => tenantLocalToUtc(`${pd.toString()}T00:00`, timezone);
  return {
    now,
    todayStart: toStart(today),
    tomorrowStart: toStart(today.add({ days: 1 })),
    dayAfterTomorrowStart: toStart(today.add({ days: 2 })),
  };
}

/**
 * Classifies one rental. `boundaries` should be computed once (via
 * `resolveTenantDayBoundaries`) and reused across every rental being
 * classified together (a list page, a dashboard summary) so they're all
 * judged against the same instant/calendar-day — never recomputed per row.
 */
export function deriveRentalAttention(
  rental: RentalAttentionInput,
  items: OverdueRentalItemInput[],
  boundaries: TenantDayBoundaries,
): RentalAttention {
  const overdue = deriveOverdueStatus(rental, items, boundaries.now);
  if (overdue.isOverdue) {
    return { category: "OVERDUE_RETURN", overdueSince: overdue.overdueSince };
  }

  if (rental.status !== "ACTIVE") {
    return { category: null, overdueSince: null };
  }
  // Not overdue and ACTIVE: plannedEnd is either still ahead, or the
  // rental has already been fully returned (deriveOverdueStatus already
  // excludes that case — see its own "not overdue once returned" rule,
  // which only applies via the `items` check, so a still-ACTIVE rental
  // reaching this branch genuinely has plannedEnd in the future or an
  // unreturned item with plannedEnd not yet passed).
  if (rental.plannedEnd >= boundaries.todayStart && rental.plannedEnd < boundaries.tomorrowStart) {
    return { category: "ENDING_TODAY", overdueSince: null };
  }
  if (
    rental.plannedEnd >= boundaries.tomorrowStart &&
    rental.plannedEnd < boundaries.dayAfterTomorrowStart
  ) {
    return { category: "ENDING_TOMORROW", overdueSince: null };
  }
  return { category: null, overdueSince: null };
}
