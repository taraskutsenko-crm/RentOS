import { estimateMonthlyBreakdown } from "./rental-pricing";
import type { MonthlyBillingStrategy } from "../types/rental";
import type { QuoteBillingMode, QuoteDiscountType } from "../types/quote";

const BASIS_POINTS_DENOMINATOR = 10_000;

export interface EstimatedQuoteItemInput {
  billingMode: QuoteBillingMode;
  quantity: number;
  unitPriceMinor?: number | undefined;
  dailyPriceMinor?: number | undefined;
  weeklyPriceMinor?: number | undefined;
  monthlyPriceMinor?: number | undefined;
  customPriceMinor?: number | undefined;
  discountType?: QuoteDiscountType | undefined;
  discountValue?: number | undefined;
  taxRateBp?: number | undefined;
  depositMinor?: number | undefined;
  /**
   * Present only for a MONTHLY item — reuses the same tenant-configurable
   * strategy engine as Rentals (`estimateMonthlyBreakdown` from
   * lib/rental-pricing.ts) rather than a separate Quotes-specific
   * implementation. See docs/adr/0008-configurable-monthly-billing-strategies.md.
   */
  monthlyBillingStrategy?: MonthlyBillingStrategy | undefined;
  customMonthLengthDays?: number | null | undefined;
}

/**
 * A client-side mirror of apps/api/src/quotes/quote-pricing.util.ts, used
 * only to give the wizard live pricing feedback before the quote is saved.
 * The API recomputes and stores the authoritative totals — this estimate is
 * never trusted or submitted directly.
 */
export function estimateDurationInDays(plannedStart: string, plannedEnd: string): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const start = new Date(plannedStart).getTime();
  const end = new Date(plannedEnd).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }
  return Math.max(1, Math.ceil((end - start) / MS_PER_DAY));
}

function resolveDiscountMinor(
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

function resolveTaxMinor(baseMinor: number, taxRateBp: number): number {
  if (taxRateBp <= 0 || baseMinor <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((baseMinor * taxRateBp) / BASIS_POINTS_DENOMINATOR));
}

export interface EstimatedQuoteItemPricing {
  lineSubtotalMinor: number;
  discountTotalMinor: number;
  taxTotalMinor: number;
  lineTotalMinor: number;
}

export function estimateQuoteItemPricing(
  item: EstimatedQuoteItemInput,
  plannedStart: string,
  plannedEnd: string,
): EstimatedQuoteItemPricing {
  let lineSubtotalMinor: number;
  if (item.billingMode === "CUSTOM") {
    lineSubtotalMinor = item.customPriceMinor ?? 0;
  } else if (item.billingMode === "FLAT") {
    lineSubtotalMinor = (item.unitPriceMinor ?? 0) * item.quantity;
  } else if (item.billingMode === "MONTHLY") {
    const { completeUnits, remainingDays } = estimateMonthlyBreakdown(
      item.monthlyBillingStrategy ?? "CALENDAR_MONTH",
      item.customMonthLengthDays,
      plannedStart,
      plannedEnd,
    );
    lineSubtotalMinor =
      ((item.monthlyPriceMinor ?? 0) * completeUnits +
        (item.dailyPriceMinor ?? 0) * remainingDays) *
      item.quantity;
  } else {
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
    lineSubtotalMinor = unitPriceMinor * units * item.quantity;
  }

  const discountTotalMinor = resolveDiscountMinor(
    lineSubtotalMinor,
    item.discountType,
    item.discountValue ?? 0,
  );
  const afterDiscount = lineSubtotalMinor - discountTotalMinor;
  const taxTotalMinor = resolveTaxMinor(afterDiscount, item.taxRateBp ?? 0);
  const lineTotalMinor = Math.max(0, afterDiscount + taxTotalMinor);

  return { lineSubtotalMinor, discountTotalMinor, taxTotalMinor, lineTotalMinor };
}

export type QuoteItemPriceFieldKey =
  | "unitPriceDisplay"
  | "dailyPriceDisplay"
  | "weeklyPriceDisplay"
  | "monthlyPriceDisplay"
  | "customPriceDisplay";

export interface QuoteItemPriceDisplayValues {
  billingMode: QuoteBillingMode;
  unitPriceDisplay: string;
  dailyPriceDisplay: string;
  weeklyPriceDisplay: string;
  monthlyPriceDisplay: string;
  customPriceDisplay: string;
}

/**
 * Mirrors apps/api/src/quotes/quote-pricing.util.ts's
 * assertQuoteBillingModePriceProvided field-by-field: the price display
 * field(s) a given billing mode requires before the item can be priced.
 * MONTHLY requires both monthlyPriceDisplay and dailyPriceDisplay — the
 * server always stamps a monthlyBillingStrategy onto every MONTHLY item
 * created through this wizard (see quotes.service.ts's
 * withMonthlyBillingSettings), which makes the daily remainder rate
 * mandatory in practice for any item actually created here, even though the
 * backend DTO leaves it technically optional for pre-existing legacy items
 * written before that engine existed.
 */
export function getRequiredQuoteItemPriceFields(
  billingMode: QuoteBillingMode,
): QuoteItemPriceFieldKey[] {
  switch (billingMode) {
    case "DAILY":
      return ["dailyPriceDisplay"];
    case "WEEKLY":
      return ["weeklyPriceDisplay"];
    case "MONTHLY":
      return ["monthlyPriceDisplay", "dailyPriceDisplay"];
    case "CUSTOM":
      return ["customPriceDisplay"];
    case "FLAT":
      return ["unitPriceDisplay"];
  }
}

/**
 * Required price fields left blank for this item's billing mode — used by
 * the Prices step to block advancing (and block Create) while a required
 * price is missing, instead of letting the item reach Review and fail at
 * the API with an internal field name (see DECISIONS.md D-070).
 */
export function getMissingQuoteItemPriceFields(
  item: QuoteItemPriceDisplayValues,
): QuoteItemPriceFieldKey[] {
  return getRequiredQuoteItemPriceFields(item.billingMode).filter((field) => !item[field].trim());
}

export interface EstimatedQuoteTotals {
  subtotalMinor: number;
  discountTotalMinor: number;
  taxTotalMinor: number;
  depositTotalMinor: number;
  totalMinor: number;
}

export function estimateQuoteTotals(
  items: EstimatedQuoteItemInput[],
  plannedStart: string,
  plannedEnd: string,
  discountType: QuoteDiscountType | null | undefined,
  discountValue: number,
): EstimatedQuoteTotals {
  const itemResults = items.map((item) => estimateQuoteItemPricing(item, plannedStart, plannedEnd));
  const subtotalMinor = itemResults.reduce((sum, result) => sum + result.lineTotalMinor, 0);
  const taxTotalMinor = itemResults.reduce((sum, result) => sum + result.taxTotalMinor, 0);
  const depositTotalMinor = items.reduce((sum, item) => sum + (item.depositMinor ?? 0), 0);
  const discountTotalMinor = resolveDiscountMinor(subtotalMinor, discountType, discountValue);
  const totalMinor = Math.max(0, subtotalMinor - discountTotalMinor);

  return { subtotalMinor, discountTotalMinor, taxTotalMinor, depositTotalMinor, totalMinor };
}
