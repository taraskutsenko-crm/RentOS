import { describe, expect, it } from "vitest";

import {
  estimateItemLineTotalMinor,
  estimateMonthsInRange,
  estimateRentalTotals,
} from "../../src/lib/rental-pricing";
import type { EstimatedItemInput } from "../../src/lib/rental-pricing";

describe("estimateItemLineTotalMinor", () => {
  it("computes a DAILY total across a 3-day span", () => {
    const item: EstimatedItemInput = {
      billingMode: "DAILY",
      quantity: 1,
      dailyPriceMinor: 1000,
      discountMinor: 0,
    };
    const total = estimateItemLineTotalMinor(item, "2026-08-01T00:00:00Z", "2026-08-04T00:00:00Z");
    expect(total).toBe(3000);
  });

  it("computes a CUSTOM total as a flat price, ignoring quantity", () => {
    const item: EstimatedItemInput = {
      billingMode: "CUSTOM",
      quantity: 5,
      customPriceMinor: 20000,
      discountMinor: 0,
    };
    const total = estimateItemLineTotalMinor(item, "2026-08-01T00:00:00Z", "2026-12-01T00:00:00Z");
    expect(total).toBe(20000);
  });

  it("subtracts the discount and floors at 0", () => {
    const item: EstimatedItemInput = {
      billingMode: "DAILY",
      quantity: 1,
      dailyPriceMinor: 100,
      discountMinor: 10_000,
    };
    const total = estimateItemLineTotalMinor(item, "2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z");
    expect(total).toBe(0);
  });

  it("returns 0 when dates are missing or invalid", () => {
    const item: EstimatedItemInput = {
      billingMode: "DAILY",
      quantity: 1,
      dailyPriceMinor: 1000,
      discountMinor: 0,
    };
    expect(estimateItemLineTotalMinor(item, "", "")).toBe(0);
  });
});

describe("estimateMonthsInRange", () => {
  it("Jan 31 -> Feb 28 is exactly 1 calendar month in a non-leap year", () => {
    expect(estimateMonthsInRange("2027-01-31T00:00:00Z", "2027-02-28T00:00:00Z")).toBe(1);
  });

  it("Jan 31 -> Feb 29 is exactly 1 calendar month in a leap year", () => {
    expect(estimateMonthsInRange("2028-01-31T00:00:00Z", "2028-02-29T00:00:00Z")).toBe(1);
  });

  it("Aug 31 -> Sep 30 is exactly 1 calendar month", () => {
    expect(estimateMonthsInRange("2026-08-31T00:00:00Z", "2026-09-30T00:00:00Z")).toBe(1);
  });

  it("returns 0 when dates are missing or invalid", () => {
    expect(estimateMonthsInRange("", "")).toBe(0);
  });
});

describe("estimateItemLineTotalMinor (MONTHLY)", () => {
  it("computes a MONTHLY total using real calendar months, not a flat 30 days", () => {
    const item: EstimatedItemInput = {
      billingMode: "MONTHLY",
      quantity: 1,
      monthlyPriceMinor: 15000,
      discountMinor: 0,
    };
    const total = estimateItemLineTotalMinor(item, "2027-01-31T00:00:00Z", "2027-02-28T00:00:00Z");
    expect(total).toBe(15000);
  });
});

describe("estimateRentalTotals", () => {
  it("sums items then applies rental-level discount and tax", () => {
    const items: EstimatedItemInput[] = [
      { billingMode: "DAILY", quantity: 1, dailyPriceMinor: 1000, discountMinor: 0 },
      { billingMode: "DAILY", quantity: 1, dailyPriceMinor: 500, discountMinor: 0 },
    ];
    const result = estimateRentalTotals(
      items,
      "2026-08-01T00:00:00Z",
      "2026-08-04T00:00:00Z",
      200,
      100,
    );
    expect(result.subtotalMinor).toBe(4500);
    expect(result.totalMinor).toBe(4500 - 200 + 100);
  });
});
