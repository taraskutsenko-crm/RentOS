import type { RentalBillingMode } from "../types/rental";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_MONTH = 30;

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

export function estimateItemLineTotalMinor(
  item: EstimatedItemInput,
  plannedStart: string,
  plannedEnd: string,
): number {
  if (item.billingMode === "CUSTOM") {
    return Math.max(0, (item.customPriceMinor ?? 0) - item.discountMinor);
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
  } else if (item.billingMode === "MONTHLY") {
    unitPriceMinor = item.monthlyPriceMinor ?? 0;
    units = Math.ceil(days / DAYS_PER_MONTH);
  }

  return Math.max(0, unitPriceMinor * units * item.quantity - item.discountMinor);
}

export function estimateRentalTotals(
  items: EstimatedItemInput[],
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
