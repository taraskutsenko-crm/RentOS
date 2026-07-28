import { BadRequestException } from "@nestjs/common";
import type { RentalBillingMode } from "@prisma/client";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Simplification: a "month" of billing is treated as 30 days. Documented in ADR 0006. */
const DAYS_PER_MONTH = 30;

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
      units = Math.ceil(days / DAYS_PER_MONTH);
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
