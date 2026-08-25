import { resolveTaxMinor } from "./tax-estimate";
import type {
  MonthlyBillingStrategy,
  PartialMonthPolicy,
  RentalBillingMode,
} from "../types/rental";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const MIN_CUSTOM_MONTH_LENGTH_DAYS = 1;
export const MAX_CUSTOM_MONTH_LENGTH_DAYS = 365;

/** A null/legacy policy behaves exactly like PRORATE_BY_DAY — mirrors apps/api/src/rentals/rental-pricing.util.ts. */
export const DEFAULT_PARTIAL_MONTH_POLICY: PartialMonthPolicy = "PRORATE_BY_DAY";

export interface EstimatedItemInput {
  billingMode: RentalBillingMode;
  quantity: number;
  dailyPriceMinor?: number | undefined;
  weeklyPriceMinor?: number | undefined;
  monthlyPriceMinor?: number | undefined;
  customPriceMinor?: number | undefined;
  discountMinor: number;
  /** Integer basis points (2300 = 23.00%) — never a float rate. Applied to this item's own already-discounted line total. */
  taxRateBp?: number | undefined;
}

/**
 * A client-side mirror of apps/api/src/rentals/rental-pricing.util.ts, used
 * only to give the wizard live pricing feedback before the rental is
 * created. The API recomputes and stores the authoritative totals — this
 * estimate is never trusted or submitted directly.
 */
export function estimateDurationInDays(plannedStart: string, plannedEnd: string): number {
  const start = new Date(plannedStart).getTime();
  const end = new Date(plannedEnd).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }
  return Math.max(1, Math.ceil((end - start) / MS_PER_DAY));
}

/**
 * Adds `months` calendar months to `date` using UTC fields (never the host's
 * local timezone), clamping the day-of-month to the target month's actual
 * length — e.g. Jan 31 + 1 month = Feb 28 (or 29 in a leap year), Aug 31 + 1
 * month = Sep 30. Time-of-day is preserved unchanged. Mirrors
 * apps/api/src/rentals/rental-pricing.util.ts.
 */
function addCalendarMonthsUtc(date: Date, months: number): Date {
  const targetMonthIndex = date.getUTCMonth() + months;
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
 * Number of real calendar months to estimate for a MONTHLY rental item — the
 * smallest `n` such that `plannedStart` plus `n` calendar months reaches or
 * passes `plannedEnd` (never 0, even for an invalid/empty range).
 *
 * Not used by `estimateMonthlyBreakdown` below (which splits a period into
 * complete months plus a daily remainder instead of rounding a partial
 * month up); kept only in case some other estimate still needs whole-month
 * rounding.
 */
export function estimateMonthsInRange(plannedStart: string, plannedEnd: string): number {
  const start = new Date(plannedStart);
  const end = new Date(plannedEnd);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return 0;
  }
  let months = 1;
  while (addCalendarMonthsUtc(start, months).getTime() < end.getTime()) {
    months++;
  }
  return months;
}

export interface MonthlyBreakdown {
  strategy: MonthlyBillingStrategy;
  customMonthLengthDays: number | null;
  completeUnits: number;
  remainingDays: number;
}

function calendarMonthBreakdown(
  start: Date,
  end: Date,
): Pick<MonthlyBreakdown, "completeUnits" | "remainingDays"> {
  let completeUnits = 0;
  while (addCalendarMonthsUtc(start, completeUnits + 1).getTime() <= end.getTime()) {
    completeUnits++;
  }
  const anchor = addCalendarMonthsUtc(start, completeUnits);
  const remainingDays = Math.max(0, Math.ceil((end.getTime() - anchor.getTime()) / MS_PER_DAY));
  return { completeUnits, remainingDays };
}

function fixedLengthBreakdown(
  unitLengthDays: number,
  plannedStart: string,
  plannedEnd: string,
): Pick<MonthlyBreakdown, "completeUnits" | "remainingDays"> {
  const totalDays = estimateDurationInDays(plannedStart, plannedEnd);
  return {
    completeUnits: Math.floor(totalDays / unitLengthDays),
    remainingDays: totalDays % unitLengthDays,
  };
}

/**
 * Client-side mirror of apps/api/src/rentals/rental-pricing.util.ts'
 * `computeMonthlyBreakdown` — must stay in exact lockstep so the wizard's
 * live estimate matches what the server actually stores. Splits a MONTHLY
 * item's period into complete monthly units (billed at monthlyPriceMinor)
 * plus remaining days (billed at dailyPriceMinor), per the tenant's chosen
 * strategy (see docs/adr/0008-configurable-monthly-billing-strategies.md).
 */
export function estimateMonthlyBreakdown(
  strategy: MonthlyBillingStrategy,
  customMonthLengthDays: number | null | undefined,
  plannedStart: string,
  plannedEnd: string,
): MonthlyBreakdown {
  const start = new Date(plannedStart);
  const end = new Date(plannedEnd);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return {
      strategy,
      customMonthLengthDays: customMonthLengthDays ?? null,
      completeUnits: 0,
      remainingDays: 0,
    };
  }

  if (strategy === "CALENDAR_MONTH") {
    return { strategy, customMonthLengthDays: null, ...calendarMonthBreakdown(start, end) };
  }
  if (strategy === "FIXED_30_DAYS") {
    return {
      strategy,
      customMonthLengthDays: null,
      ...fixedLengthBreakdown(30, plannedStart, plannedEnd),
    };
  }
  const validLength =
    customMonthLengthDays &&
    customMonthLengthDays >= MIN_CUSTOM_MONTH_LENGTH_DAYS &&
    customMonthLengthDays <= MAX_CUSTOM_MONTH_LENGTH_DAYS
      ? customMonthLengthDays
      : null;
  if (validLength === null) {
    return { strategy, customMonthLengthDays: null, completeUnits: 0, remainingDays: 0 };
  }
  return {
    strategy,
    customMonthLengthDays: validLength,
    ...fixedLengthBreakdown(validLength, plannedStart, plannedEnd),
  };
}

export interface EstimatedMonthlyItemInput extends EstimatedItemInput {
  billingMode: "MONTHLY";
  monthlyBillingStrategy: MonthlyBillingStrategy;
  customMonthLengthDays?: number | null | undefined;
  partialMonthPolicy?: PartialMonthPolicy | null | undefined;
}

/**
 * Applies a MONTHLY item's partial-month policy to a breakdown, returning
 * the monthly-portion charge (before quantity/discount) — mirrors
 * apps/api/src/rentals/rental-pricing.util.ts's `applyPartialMonthPolicy`
 * exactly (see DECISIONS.md D-072):
 *  - PRORATE_BY_DAY (default/legacy): complete units at monthlyPriceMinor,
 *    plus the remaining days at dailyPriceMinor.
 *  - ROUND_UP_TO_FULL_MONTH: any started remaining period rounds up to one
 *    more full monthlyPriceMinor unit; dailyPriceMinor is never read.
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

export function estimateItemLineTotalMinor(
  item: EstimatedItemInput | EstimatedMonthlyItemInput,
  plannedStart: string,
  plannedEnd: string,
): number {
  if (item.billingMode === "CUSTOM") {
    return Math.max(0, (item.customPriceMinor ?? 0) - item.discountMinor);
  }

  if (item.billingMode === "MONTHLY") {
    const monthlyItem = item as EstimatedMonthlyItemInput;
    const breakdown = estimateMonthlyBreakdown(
      monthlyItem.monthlyBillingStrategy,
      monthlyItem.customMonthLengthDays,
      plannedStart,
      plannedEnd,
    );
    const monthlyChargeMinor = applyPartialMonthPolicy(
      breakdown,
      item.monthlyPriceMinor ?? 0,
      item.dailyPriceMinor,
      monthlyItem.partialMonthPolicy,
    );
    const gross = monthlyChargeMinor * item.quantity;
    return Math.max(0, gross - item.discountMinor);
  }

  const days = estimateDurationInDays(plannedStart, plannedEnd);
  let unitPriceMinor = 0;
  let units = 0;
  if (item.billingMode === "DAILY") {
    unitPriceMinor = item.dailyPriceMinor ?? 0;
    units = days;
  } else if (item.billingMode === "WEEKLY") {
    unitPriceMinor = item.weeklyPriceMinor ?? 0;
    units = Math.ceil(days / 7);
  }

  return Math.max(0, unitPriceMinor * units * item.quantity - item.discountMinor);
}

export type RentalItemPriceFieldKey =
  "dailyPriceDisplay" | "weeklyPriceDisplay" | "monthlyPriceDisplay" | "customPriceDisplay";

export interface RentalItemPriceDisplayValues {
  billingMode: RentalBillingMode;
  dailyPriceDisplay: string;
  weeklyPriceDisplay: string;
  monthlyPriceDisplay: string;
  customPriceDisplay: string;
  /** Only meaningful for MONTHLY — see getRequiredRentalItemPriceFields. */
  partialMonthPolicy?: PartialMonthPolicy | null | undefined;
}

/**
 * Mirrors apps/api/src/rentals/rental-pricing.util.ts's
 * assertBillingModePriceProvided field-by-field. MONTHLY always requires
 * monthlyPriceDisplay; dailyPriceDisplay (for the partial-month remainder)
 * is required only when the resolved partialMonthPolicy is PRORATE_BY_DAY —
 * a ROUND_UP_TO_FULL_MONTH item never needs a daily rate (see DECISIONS.md
 * D-072).
 */
export function getRequiredRentalItemPriceFields(
  billingMode: RentalBillingMode,
  partialMonthPolicy?: PartialMonthPolicy | null | undefined,
): RentalItemPriceFieldKey[] {
  switch (billingMode) {
    case "DAILY":
      return ["dailyPriceDisplay"];
    case "WEEKLY":
      return ["weeklyPriceDisplay"];
    case "MONTHLY":
      return (partialMonthPolicy ?? DEFAULT_PARTIAL_MONTH_POLICY) === "ROUND_UP_TO_FULL_MONTH"
        ? ["monthlyPriceDisplay"]
        : ["monthlyPriceDisplay", "dailyPriceDisplay"];
    case "CUSTOM":
      return ["customPriceDisplay"];
  }
}

/**
 * Required price fields left blank for this item's billing mode — used by
 * the Prices step to block advancing (and block Create) while a required
 * price is missing, instead of letting the item reach Review and fail at
 * the API with an internal field name (see DECISIONS.md D-070, D-072).
 */
export function getMissingRentalItemPriceFields(
  item: RentalItemPriceDisplayValues,
): RentalItemPriceFieldKey[] {
  return getRequiredRentalItemPriceFields(item.billingMode, item.partialMonthPolicy).filter(
    (field) => !item[field].trim(),
  );
}

/**
 * Mirrors apps/api/src/rentals/rental-pricing.util.ts's `computeRentalTotals`
 * exactly: subtotal = sum of item line totals (each already net of its own
 * discount); taxMinor = sum of each item's own tax, computed from its
 * taxRateBp applied to that item's own (already-discounted) line total —
 * never a manually-entered flat amount (see docs/DECISIONS.md D-090). total
 * = subtotal - rental-level discount + tax, floored at 0.
 */
export function estimateRentalTotals(
  items: (EstimatedItemInput | EstimatedMonthlyItemInput)[],
  plannedStart: string,
  plannedEnd: string,
  discountMinor: number,
): { subtotalMinor: number; taxMinor: number; totalMinor: number } {
  const itemNetTotals = items.map((item) =>
    estimateItemLineTotalMinor(item, plannedStart, plannedEnd),
  );
  const subtotalMinor = itemNetTotals.reduce((sum, value) => sum + value, 0);
  const taxMinor = items.reduce(
    (sum, item, index) => sum + resolveTaxMinor(itemNetTotals[index]!, item.taxRateBp ?? 0),
    0,
  );
  return { subtotalMinor, taxMinor, totalMinor: Math.max(0, subtotalMinor - discountMinor + taxMinor) };
}
