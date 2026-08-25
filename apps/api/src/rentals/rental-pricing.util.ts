import { BadRequestException } from "@nestjs/common";
import type { MonthlyBillingStrategy, PartialMonthPolicy, RentalBillingMode } from "@prisma/client";

import { resolveTaxMinor } from "../common/tax.util";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const MIN_CUSTOM_MONTH_LENGTH_DAYS = 1;
export const MAX_CUSTOM_MONTH_LENGTH_DAYS = 365;

/** A null/legacy policy behaves exactly like PRORATE_BY_DAY — see PartialMonthPolicy's schema doc comment. */
export const DEFAULT_PARTIAL_MONTH_POLICY: PartialMonthPolicy = "PRORATE_BY_DAY";

export interface PricedRentalItemInput {
  billingMode: RentalBillingMode;
  quantity: number;
  dailyPriceMinor?: number | null;
  weeklyPriceMinor?: number | null;
  monthlyPriceMinor?: number | null;
  customPriceMinor?: number | null;
  discountMinor: number;
  /** Integer basis points (2300 = 23.00%) — never a float rate. Applied to this item's own already-discounted line total; see resolveTaxMinor. */
  taxRateBp?: number | null;
  /** Required (together with dailyPriceMinor, when partialMonthPolicy is PRORATE_BY_DAY) only when billingMode is MONTHLY — see computeMonthlyBreakdown. */
  monthlyBillingStrategy?: MonthlyBillingStrategy | null;
  /** Required only when monthlyBillingStrategy is CUSTOM; ignored otherwise. */
  customMonthLengthDays?: number | null;
  /** How the item's leftover partial month is charged — see PartialMonthPolicy. Null/legacy behaves as PRORATE_BY_DAY. */
  partialMonthPolicy?: PartialMonthPolicy | null;
}

/** Rentals spanning any part of a day count that whole day — a same-day rental is 1 day, never 0. */
export function durationInDays(plannedStart: Date, plannedEnd: Date): number {
  const days = Math.ceil((plannedEnd.getTime() - plannedStart.getTime()) / MS_PER_DAY);
  return Math.max(1, days);
}

/**
 * Adds `months` calendar months to `date` using UTC fields (never the host's
 * local timezone), clamping the day-of-month to the target month's actual
 * length — e.g. Jan 31 + 1 month = Feb 28 (or 29 in a leap year), Aug 31 + 1
 * month = Sep 30. Time-of-day is preserved unchanged.
 */
export function addCalendarMonthsUtc(date: Date, months: number): Date {
  const targetMonthIndex = date.getUTCMonth() + months;
  // Day 0 of the month *after* the target month is the last day of the target month.
  const daysInTargetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), targetMonthIndex + 1, 0),
  ).getUTCDate();
  const clampedDay = Math.min(date.getUTCDate(), daysInTargetMonth);
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      targetMonthIndex,
      clampedDay,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/**
 * Number of real calendar months to bill for a MONTHLY rental item — the
 * smallest `n` such that `plannedStart` plus `n` calendar months reaches or
 * passes `plannedEnd`. A rental spanning any part of a month counts that
 * whole month (never 0), matching the DAILY/WEEKLY rounding rule.
 *
 * Still used as-is by the Quotes module (QuoteItem has no tenant-configurable
 * billing strategy — see ADR 0007/0008) and kept unchanged here for that
 * reason. Rentals themselves now use `computeMonthlyBreakdown` below, which
 * — unlike this function — splits a partial month into a daily-priced
 * remainder instead of rounding it up to a whole extra month.
 */
export function monthsInRange(plannedStart: Date, plannedEnd: Date): number {
  let months = 1;
  while (addCalendarMonthsUtc(plannedStart, months).getTime() < plannedEnd.getTime()) {
    months++;
  }
  return months;
}

export function assertCustomMonthLengthDays(value: number | null | undefined): number {
  if (
    value === null ||
    value === undefined ||
    !Number.isInteger(value) ||
    value < MIN_CUSTOM_MONTH_LENGTH_DAYS ||
    value > MAX_CUSTOM_MONTH_LENGTH_DAYS
  ) {
    throw new BadRequestException(
      `customMonthLengthDays must be an integer between ${MIN_CUSTOM_MONTH_LENGTH_DAYS} and ${MAX_CUSTOM_MONTH_LENGTH_DAYS}`,
    );
  }
  return value;
}

export interface MonthlyBreakdown {
  strategy: MonthlyBillingStrategy;
  customMonthLengthDays: number | null;
  /** Complete monthly units, priced at the item's monthlyPriceMinor. */
  completeUnits: number;
  /** Days left over after the last complete unit, priced at the item's dailyPriceMinor. */
  remainingDays: number;
}

/**
 * Largest n >= 0 such that plannedStart plus n calendar months does not pass
 * plannedEnd, plus the (possibly zero) whole days remaining after that
 * anchor. Unlike `monthsInRange` (which always rounds a partial month up to
 * a full one), this splits a period into its complete calendar months and a
 * daily-priced remainder — e.g. Jan 15 -> Mar 20 is 2 complete months
 * (Jan15->Mar15) plus 5 remaining days, not 3 whole months.
 */
function calendarMonthBreakdown(
  plannedStart: Date,
  plannedEnd: Date,
): Pick<MonthlyBreakdown, "completeUnits" | "remainingDays"> {
  let completeUnits = 0;
  while (addCalendarMonthsUtc(plannedStart, completeUnits + 1).getTime() <= plannedEnd.getTime()) {
    completeUnits++;
  }
  const anchor = addCalendarMonthsUtc(plannedStart, completeUnits);
  const remainingDays = Math.max(
    0,
    Math.ceil((plannedEnd.getTime() - anchor.getTime()) / MS_PER_DAY),
  );
  return { completeUnits, remainingDays };
}

/** Splits total billable days (via durationInDays) into complete fixed-length units plus a remainder. */
function fixedLengthBreakdown(
  unitLengthDays: number,
  plannedStart: Date,
  plannedEnd: Date,
): Pick<MonthlyBreakdown, "completeUnits" | "remainingDays"> {
  const totalDays = durationInDays(plannedStart, plannedEnd);
  return {
    completeUnits: Math.floor(totalDays / unitLengthDays),
    remainingDays: totalDays % unitLengthDays,
  };
}

/**
 * Computes how a MONTHLY-billed rental item splits into complete monthly
 * units (priced at monthlyPriceMinor) plus remaining days (priced at
 * dailyPriceMinor), according to the tenant's chosen strategy
 * (see docs/adr/0008-configurable-monthly-billing-strategies.md):
 *
 *  - CALENDAR_MONTH: real calendar-month arithmetic (leap-year and
 *    end-of-month safe, UTC-only — never the host's local timezone).
 *  - FIXED_30_DAYS: every complete 30 billable days is one unit.
 *  - CUSTOM: every complete `customMonthLengthDays` (1-365) billable days
 *    is one unit.
 *
 * Pure and deterministic — given the same inputs it always reproduces the
 * same result, which is what lets a RentalItem snapshot just the strategy
 * and customMonthLengthDays it used (frozen at write time) rather than the
 * breakdown itself, and still reconstruct it exactly later even if the
 * tenant's settings change in the meantime.
 */
export function computeMonthlyBreakdown(
  strategy: MonthlyBillingStrategy,
  customMonthLengthDays: number | null | undefined,
  plannedStart: Date,
  plannedEnd: Date,
): MonthlyBreakdown {
  if (strategy === "CALENDAR_MONTH") {
    return {
      strategy,
      customMonthLengthDays: null,
      ...calendarMonthBreakdown(plannedStart, plannedEnd),
    };
  }
  if (strategy === "FIXED_30_DAYS") {
    return {
      strategy,
      customMonthLengthDays: null,
      ...fixedLengthBreakdown(30, plannedStart, plannedEnd),
    };
  }
  const validLength = assertCustomMonthLengthDays(customMonthLengthDays);
  return {
    strategy,
    customMonthLengthDays: validLength,
    ...fixedLengthBreakdown(validLength, plannedStart, plannedEnd),
  };
}

/**
 * Applies a MONTHLY item's partial-month policy to a breakdown, returning
 * the monthly-portion charge (before quantity/discount) — see
 * PartialMonthPolicy's schema doc comment:
 *  - PRORATE_BY_DAY (default/legacy): complete units at monthlyPriceMinor,
 *    plus the remaining days at dailyPriceMinor.
 *  - ROUND_UP_TO_FULL_MONTH: any started remaining period rounds up to one
 *    more full monthlyPriceMinor unit; dailyPriceMinor is never read.
 * Shared by both Rentals and Quotes (see quote-pricing.util.ts) — the one
 * source of truth for this calculation.
 */
export function applyPartialMonthPolicy(
  breakdown: Pick<MonthlyBreakdown, "completeUnits" | "remainingDays">,
  monthlyPriceMinor: number,
  dailyPriceMinor: number | null | undefined,
  policy: PartialMonthPolicy | null | undefined,
): number {
  if ((policy ?? DEFAULT_PARTIAL_MONTH_POLICY) === "ROUND_UP_TO_FULL_MONTH") {
    const units = breakdown.completeUnits + (breakdown.remainingDays > 0 ? 1 : 0);
    return monthlyPriceMinor * units;
  }
  return (
    monthlyPriceMinor * breakdown.completeUnits + (dailyPriceMinor ?? 0) * breakdown.remainingDays
  );
}

/**
 * Validates that the price field(s) matching `billingMode` are present and
 * non-negative (CUSTOM uses customPriceMinor as a flat total, ignoring
 * duration/quantity of days entirely). MONTHLY always requires
 * monthlyPriceMinor (for complete units) and a monthlyBillingStrategy;
 * dailyPriceMinor (for the remainder days) is required only when the
 * item's partialMonthPolicy resolves to PRORATE_BY_DAY — a
 * ROUND_UP_TO_FULL_MONTH item never needs a daily rate at all (see
 * DECISIONS.md D-072).
 */
export function assertBillingModePriceProvided(item: PricedRentalItemInput): void {
  if (item.billingMode === "MONTHLY") {
    if (item.monthlyPriceMinor === undefined || item.monthlyPriceMinor === null) {
      throw new BadRequestException("monthlyPriceMinor is required when billingMode is MONTHLY");
    }
    const policy = item.partialMonthPolicy ?? DEFAULT_PARTIAL_MONTH_POLICY;
    if (
      policy === "PRORATE_BY_DAY" &&
      (item.dailyPriceMinor === undefined || item.dailyPriceMinor === null)
    ) {
      throw new BadRequestException(
        "dailyPriceMinor is required when billingMode is MONTHLY and partialMonthPolicy is PRORATE_BY_DAY (used for any partial-month remainder)",
      );
    }
    if (!item.monthlyBillingStrategy) {
      throw new BadRequestException(
        "monthlyBillingStrategy is required when billingMode is MONTHLY",
      );
    }
    return;
  }

  const requiredField: Partial<Record<RentalBillingMode, keyof PricedRentalItemInput>> = {
    DAILY: "dailyPriceMinor",
    WEEKLY: "weeklyPriceMinor",
    CUSTOM: "customPriceMinor",
  };
  const field = requiredField[item.billingMode]!;
  const value = item[field];
  if (value === undefined || value === null) {
    throw new BadRequestException(`${field} is required when billingMode is ${item.billingMode}`);
  }
}

/** Computes one rental item's line total (after its own discount, floored at 0), in minor units. */
export function computeItemLineTotalMinor(
  item: PricedRentalItemInput,
  plannedStart: Date,
  plannedEnd: Date,
): number {
  assertBillingModePriceProvided(item);

  // CUSTOM is a single negotiated flat price for the whole line — duration
  // and quantity are both ignored, unlike the per-unit-per-period modes.
  if (item.billingMode === "CUSTOM") {
    return Math.max(0, item.customPriceMinor! - item.discountMinor);
  }

  if (item.billingMode === "MONTHLY") {
    const breakdown = computeMonthlyBreakdown(
      item.monthlyBillingStrategy!,
      item.customMonthLengthDays,
      plannedStart,
      plannedEnd,
    );
    const monthlyChargeMinor = applyPartialMonthPolicy(
      breakdown,
      item.monthlyPriceMinor!,
      item.dailyPriceMinor,
      item.partialMonthPolicy,
    );
    const grossMinor = monthlyChargeMinor * item.quantity;
    return Math.max(0, grossMinor - item.discountMinor);
  }

  const days = durationInDays(plannedStart, plannedEnd);
  const unitPriceMinor =
    item.billingMode === "DAILY" ? item.dailyPriceMinor! : item.weeklyPriceMinor!;
  const units = item.billingMode === "DAILY" ? days : Math.ceil(days / 7);

  const grossMinor = unitPriceMinor * units * item.quantity;
  return Math.max(0, grossMinor - item.discountMinor);
}

export interface RentalTotals {
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}

/**
 * subtotal = sum of item line totals (each already net of its own
 * discount); taxMinor = sum of each item's own tax, computed from its
 * `taxRateBp` applied to that item's own (already-discounted) line total
 * — never a manually-entered flat amount (see docs/DECISIONS.md, rental
 * tax percentage model; ARCHITECTURE_LOCK §1.5 historical financial
 * immutability). total = subtotal - rental-level discount + tax, floored
 * at 0 — the rental-level discount is applied on top of already-taxed
 * line totals, matching Quote's identical "loyalty discount on the whole
 * order" ordering (see quote-pricing.util.ts's computeQuoteTotals).
 */
export function computeRentalTotals(
  items: PricedRentalItemInput[],
  plannedStart: Date,
  plannedEnd: Date,
  rentalDiscountMinor: number,
): RentalTotals {
  const itemNetTotals = items.map((item) =>
    computeItemLineTotalMinor(item, plannedStart, plannedEnd),
  );
  const subtotalMinor = itemNetTotals.reduce((sum, value) => sum + value, 0);
  const taxMinor = items.reduce(
    (sum, item, index) => sum + resolveTaxMinor(itemNetTotals[index]!, item.taxRateBp ?? 0),
    0,
  );
  const totalMinor = Math.max(0, subtotalMinor - rentalDiscountMinor + taxMinor);
  return { subtotalMinor, taxMinor, totalMinor };
}
