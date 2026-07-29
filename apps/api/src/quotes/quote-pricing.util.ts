import { BadRequestException } from "@nestjs/common";
import type { QuoteBillingMode, QuoteDiscountType } from "@prisma/client";

import { durationInDays, monthsInRange } from "../rentals/rental-pricing.util";

const BASIS_POINTS_DENOMINATOR = 10_000;

export interface PricedQuoteItemInput {
  billingMode: QuoteBillingMode;
  quantity: number;
  unitPriceMinor?: number | null;
  dailyPriceMinor?: number | null;
  weeklyPriceMinor?: number | null;
  monthlyPriceMinor?: number | null;
  customPriceMinor?: number | null;
  discountType?: QuoteDiscountType | null;
  discountValue: number;
  /** Integer basis points (2000 = 20.00%) — never a float rate. */
  taxRateBp: number;
  depositMinor: number;
}

export interface QuoteItemPricingResult {
  lineSubtotalMinor: number;
  discountTotalMinor: number;
  taxTotalMinor: number;
  lineTotalMinor: number;
}

export interface QuoteTotals {
  subtotalMinor: number;
  discountTotalMinor: number;
  taxTotalMinor: number;
  depositTotalMinor: number;
  totalMinor: number;
}

export interface QuoteTotalsResult extends QuoteTotals {
  items: QuoteItemPricingResult[];
}

/**
 * Resolves a discount amount from a type+value pair. FIXED interprets
 * `value` as minor currency units; PERCENTAGE interprets it as integer
 * basis points of `baseMinor` (1000 = 10.00%). Exactly one `Math.round` per
 * call, never chained — this is the "decimal-safe arithmetic" the task
 * requires, done with integers throughout rather than a Decimal library
 * (see ADR 0007). Always clamped to [0, baseMinor] — a discount can never
 * exceed the amount it's discounting or go negative.
 */
export function resolveDiscountMinor(
  baseMinor: number,
  discountType: QuoteDiscountType | null | undefined,
  discountValue: number,
): number {
  if (!discountType || discountValue <= 0 || baseMinor <= 0) {
    return 0;
  }
  const raw =
    discountType === "FIXED"
      ? discountValue
      : Math.round((baseMinor * discountValue) / BASIS_POINTS_DENOMINATOR);
  return Math.min(baseMinor, Math.max(0, raw));
}

/** Resolves a tax amount from integer basis points, one rounding step, never negative. */
export function resolveTaxMinor(baseMinor: number, taxRateBp: number): number {
  if (taxRateBp <= 0 || baseMinor <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((baseMinor * taxRateBp) / BASIS_POINTS_DENOMINATOR));
}

/**
 * Validates that the price field matching `billingMode` is present
 * (mirrors rental-pricing.util's assertBillingModePriceProvided, extended
 * with FLAT — unitPriceMinor * quantity, no duration factor, for lines that
 * aren't priced per day/week/month).
 */
export function assertQuoteBillingModePriceProvided(item: PricedQuoteItemInput): void {
  const requiredField: Record<QuoteBillingMode, keyof PricedQuoteItemInput> = {
    DAILY: "dailyPriceMinor",
    WEEKLY: "weeklyPriceMinor",
    MONTHLY: "monthlyPriceMinor",
    CUSTOM: "customPriceMinor",
    FLAT: "unitPriceMinor",
  };
  const field = requiredField[item.billingMode];
  const value = item[field];
  if (value === undefined || value === null) {
    throw new BadRequestException(`${field} is required when billingMode is ${item.billingMode}`);
  }
}

/**
 * Computes one quote item's pricing breakdown: gross subtotal, its own
 * discount, its own tax (basis-point rate, applied after the discount), and
 * the resulting line total — all in minor units, floored at 0. CUSTOM
 * ignores duration and quantity (a single negotiated flat price, matching
 * RentalItem's CUSTOM semantics exactly); FLAT ignores duration but
 * respects quantity (unitPriceMinor * quantity — a delivery fee, N hours of
 * labor, N units of a product); DAILY/WEEKLY/MONTHLY reuse
 * rental-pricing.util's calendar-accurate duration/month math unchanged.
 */
export function computeQuoteItemPricing(
  item: PricedQuoteItemInput,
  plannedStart: Date,
  plannedEnd: Date,
): QuoteItemPricingResult {
  assertQuoteBillingModePriceProvided(item);

  let lineSubtotalMinor: number;
  if (item.billingMode === "CUSTOM") {
    lineSubtotalMinor = item.customPriceMinor!;
  } else if (item.billingMode === "FLAT") {
    lineSubtotalMinor = item.unitPriceMinor! * item.quantity;
  } else {
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
    lineSubtotalMinor = unitPriceMinor * units * item.quantity;
  }

  const discountTotalMinor = resolveDiscountMinor(
    lineSubtotalMinor,
    item.discountType,
    item.discountValue,
  );
  const afterDiscount = lineSubtotalMinor - discountTotalMinor;
  const taxTotalMinor = resolveTaxMinor(afterDiscount, item.taxRateBp);
  const lineTotalMinor = Math.max(0, afterDiscount + taxTotalMinor);

  return { lineSubtotalMinor, discountTotalMinor, taxTotalMinor, lineTotalMinor };
}

/**
 * subtotal = sum of item line totals (each already net of its own
 * discount+tax, mirroring how Rental.subtotalMinor sums pre-netted item
 * totals); the quote-level discount is an additional layer on top of that
 * (a "loyalty discount on the whole order," same flat-on-top pattern as
 * Rental.discountMinor); taxTotalMinor is a display aggregate of every
 * line's own tax (already included inside subtotal, never added twice);
 * depositTotalMinor is a display aggregate only, excluded from totalMinor —
 * matching how RentalItem.depositMinor is never folded into Rental.totalMinor.
 */
export function computeQuoteTotals(
  items: PricedQuoteItemInput[],
  plannedStart: Date,
  plannedEnd: Date,
  quoteDiscountType: QuoteDiscountType | null | undefined,
  quoteDiscountValue: number,
): QuoteTotalsResult {
  const itemResults = items.map((item) => computeQuoteItemPricing(item, plannedStart, plannedEnd));
  const subtotalMinor = itemResults.reduce((sum, result) => sum + result.lineTotalMinor, 0);
  const taxTotalMinor = itemResults.reduce((sum, result) => sum + result.taxTotalMinor, 0);
  const depositTotalMinor = items.reduce((sum, item) => sum + (item.depositMinor ?? 0), 0);
  const discountTotalMinor = resolveDiscountMinor(
    subtotalMinor,
    quoteDiscountType,
    quoteDiscountValue,
  );
  const totalMinor = Math.max(0, subtotalMinor - discountTotalMinor);

  return {
    items: itemResults,
    subtotalMinor,
    discountTotalMinor,
    taxTotalMinor,
    depositTotalMinor,
    totalMinor,
  };
}
