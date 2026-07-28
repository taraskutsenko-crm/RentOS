import { BadRequestException } from "@nestjs/common";
import type { RentalBillingMode } from "@prisma/client";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface PricedRentalItemInput {
  billingMode: RentalBillingMode;
  quantity: number;
  dailyPriceMinor?: number | null;
  weeklyPriceMinor?: number | null;
  monthlyPriceMinor?: number | null;
  customPriceMinor?: number | null;
  discountMinor: number;
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
function addCalendarMonthsUtc(date: Date, months: number): Date {
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
 */
export function monthsInRange(plannedStart: Date, plannedEnd: Date): number {
  let months = 1;
  while (addCalendarMonthsUtc(plannedStart, months).getTime() < plannedEnd.getTime()) {
    months++;
  }
  return months;
}

/**
 * Validates that the price field matching `billingMode` is present and
 * non-negative (CUSTOM uses customPriceMinor as a flat total, ignoring
 * duration/quantity of days entirely).
 */
export function assertBillingModePriceProvided(item: PricedRentalItemInput): void {
  const requiredField: Record<RentalBillingMode, keyof PricedRentalItemInput> = {
    DAILY: "dailyPriceMinor",
    WEEKLY: "weeklyPriceMinor",
    MONTHLY: "monthlyPriceMinor",
    CUSTOM: "customPriceMinor",
  };
  const field = requiredField[item.billingMode];
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

  const days = durationInDays(plannedStart, plannedEnd);
  let unitPriceMinor: number;
  let units: number;
  switch (item.billingMode) {
    case "DAILY":
      unitPriceMinor = item.dailyPriceMinor!;
      units = days;
      break;
    case "WEEKLY":
      unitPriceMinor = item.weeklyPriceMinor!;
      units = Math.ceil(days / 7);
      break;
    case "MONTHLY":
      unitPriceMinor = item.monthlyPriceMinor!;
      units = monthsInRange(plannedStart, plannedEnd);
      break;
  }

  const grossMinor = unitPriceMinor * units * item.quantity;
  return Math.max(0, grossMinor - item.discountMinor);
}

export interface RentalTotals {
  subtotalMinor: number;
  totalMinor: number;
}

/** subtotal = sum of item line totals; total = subtotal - rental-level discount + tax, floored at 0. */
export function computeRentalTotals(
  items: PricedRentalItemInput[],
  plannedStart: Date,
  plannedEnd: Date,
  rentalDiscountMinor: number,
  rentalTaxMinor: number,
): RentalTotals {
  const subtotalMinor = items.reduce(
    (sum, item) => sum + computeItemLineTotalMinor(item, plannedStart, plannedEnd),
    0,
  );
  const totalMinor = Math.max(0, subtotalMinor - rentalDiscountMinor + rentalTaxMinor);
  return { subtotalMinor, totalMinor };
}
