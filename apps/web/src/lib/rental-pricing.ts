import type { MonthlyBillingStrategy, RentalBillingMode } from "../types/rental";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const MIN_CUSTOM_MONTH_LENGTH_DAYS = 1;
export const MAX_CUSTOM_MONTH_LENGTH_DAYS = 365;

export interface EstimatedItemInput {
  billingMode: RentalBillingMode;
  quantity: number;
  dailyPriceMinor?: number | undefined;
  weeklyPriceMinor?: number | undefined;
  monthlyPriceMinor?: number | undefined;
  customPriceMinor?: number | undefined;
  discountMinor: number;
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
    const { completeUnits, remainingDays } = estimateMonthlyBreakdown(
      monthlyItem.monthlyBillingStrategy,
      monthlyItem.customMonthLengthDays,
      plannedStart,
      plannedEnd,
    );
    const gross =
      ((item.monthlyPriceMinor ?? 0) * completeUnits +
        (item.dailyPriceMinor ?? 0) * remainingDays) *
      item.quantity;
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

export function estimateRentalTotals(
  items: (EstimatedItemInput | EstimatedMonthlyItemInput)[],
  plannedStart: string,
  plannedEnd: string,
  discountMinor: number,
  taxMinor: number,
): { subtotalMinor: number; totalMinor: number } {
  const subtotalMinor = items.reduce(
    (sum, item) => sum + estimateItemLineTotalMinor(item, plannedStart, plannedEnd),
    0,
  );
  return { subtotalMinor, totalMinor: Math.max(0, subtotalMinor - discountMinor + taxMinor) };
}
