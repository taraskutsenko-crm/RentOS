import { describe, expect, it } from "vitest";

import {
  estimateItemLineTotalMinor,
  estimateMonthlyBreakdown,
  estimateMonthsInRange,
  estimateRentalTotals,
  getMissingRentalItemPriceFields,
  getRequiredRentalItemPriceFields,
} from "../../src/lib/rental-pricing";
import type {
  EstimatedItemInput,
  EstimatedMonthlyItemInput,
  RentalItemPriceDisplayValues,
} from "../../src/lib/rental-pricing";

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

describe("estimateMonthlyBreakdown", () => {
  it("CALENDAR_MONTH: Jan 31 -> Feb 28 is exactly 1 complete month, 0 remaining days", () => {
    expect(
      estimateMonthlyBreakdown(
        "CALENDAR_MONTH",
        null,
        "2027-01-31T00:00:00Z",
        "2027-02-28T00:00:00Z",
      ),
    ).toMatchObject({ completeUnits: 1, remainingDays: 0 });
  });

  it("CALENDAR_MONTH: Jan 15 -> Mar 20 splits into 2 complete months plus 5 remaining days", () => {
    expect(
      estimateMonthlyBreakdown(
        "CALENDAR_MONTH",
        null,
        "2026-01-15T00:00:00Z",
        "2026-03-20T00:00:00Z",
      ),
    ).toEqual({
      strategy: "CALENDAR_MONTH",
      customMonthLengthDays: null,
      completeUnits: 2,
      remainingDays: 5,
    });
  });

  it("FIXED_30_DAYS: 65 days splits into 2 units plus 5 remaining days", () => {
    expect(
      estimateMonthlyBreakdown(
        "FIXED_30_DAYS",
        null,
        "2026-01-01T00:00:00Z",
        "2026-03-07T00:00:00Z",
      ),
    ).toMatchObject({ completeUnits: 2, remainingDays: 5 });
  });

  it("CUSTOM: 60 days with a 28-day period splits into 2 units plus 4 remaining days", () => {
    expect(
      estimateMonthlyBreakdown("CUSTOM", 28, "2026-01-01T00:00:00Z", "2026-03-02T00:00:00Z"),
    ).toEqual({
      strategy: "CUSTOM",
      customMonthLengthDays: 28,
      completeUnits: 2,
      remainingDays: 4,
    });
  });

  it("returns 0/0 for an invalid or missing custom length", () => {
    expect(
      estimateMonthlyBreakdown("CUSTOM", null, "2026-01-01T00:00:00Z", "2026-03-02T00:00:00Z"),
    ).toMatchObject({ completeUnits: 0, remainingDays: 0 });
  });

  it("returns 0/0 for missing or invalid dates", () => {
    expect(estimateMonthlyBreakdown("CALENDAR_MONTH", null, "", "")).toMatchObject({
      completeUnits: 0,
      remainingDays: 0,
    });
  });
});

describe("estimateItemLineTotalMinor (MONTHLY)", () => {
  it("computes a MONTHLY total under CALENDAR_MONTH: complete months plus a daily-priced remainder", () => {
    const item: EstimatedMonthlyItemInput = {
      billingMode: "MONTHLY",
      quantity: 1,
      monthlyPriceMinor: 20000,
      dailyPriceMinor: 1000,
      discountMinor: 0,
      monthlyBillingStrategy: "CALENDAR_MONTH",
    };
    const total = estimateItemLineTotalMinor(item, "2026-01-15T00:00:00Z", "2026-03-20T00:00:00Z");
    expect(total).toBe(20000 * 2 + 1000 * 5);
  });

  it("computes a MONTHLY total across a calendar-month-exact span with no remainder", () => {
    const item: EstimatedMonthlyItemInput = {
      billingMode: "MONTHLY",
      quantity: 1,
      monthlyPriceMinor: 15000,
      dailyPriceMinor: 500,
      discountMinor: 0,
      monthlyBillingStrategy: "CALENDAR_MONTH",
    };
    const total = estimateItemLineTotalMinor(item, "2027-01-31T00:00:00Z", "2027-02-28T00:00:00Z");
    expect(total).toBe(15000);
  });

  it("computes a MONTHLY total under FIXED_30_DAYS", () => {
    const item: EstimatedMonthlyItemInput = {
      billingMode: "MONTHLY",
      quantity: 1,
      monthlyPriceMinor: 30000,
      dailyPriceMinor: 900,
      discountMinor: 0,
      monthlyBillingStrategy: "FIXED_30_DAYS",
    };
    const total = estimateItemLineTotalMinor(item, "2026-01-01T00:00:00Z", "2026-03-07T00:00:00Z");
    expect(total).toBe(30000 * 2 + 900 * 5);
  });

  it("computes a MONTHLY total under CUSTOM", () => {
    const item: EstimatedMonthlyItemInput = {
      billingMode: "MONTHLY",
      quantity: 1,
      monthlyPriceMinor: 28000,
      dailyPriceMinor: 800,
      discountMinor: 0,
      monthlyBillingStrategy: "CUSTOM",
      customMonthLengthDays: 28,
    };
    const total = estimateItemLineTotalMinor(item, "2026-01-01T00:00:00Z", "2026-03-02T00:00:00Z");
    expect(total).toBe(28000 * 2 + 800 * 4);
  });
});

describe("estimateRentalTotals", () => {
  it("sums items then applies rental-level discount and per-item tax", () => {
    const items: EstimatedItemInput[] = [
      {
        billingMode: "DAILY",
        quantity: 1,
        dailyPriceMinor: 1000,
        discountMinor: 0,
        taxRateBp: 1000,
      },
      {
        billingMode: "DAILY",
        quantity: 1,
        dailyPriceMinor: 500,
        discountMinor: 0,
        taxRateBp: 1000,
      },
    ];
    const result = estimateRentalTotals(items, "2026-08-01T00:00:00Z", "2026-08-04T00:00:00Z", 200);
    // subtotal = (1000*3) + (500*3) = 4500; tax = 3000*10% + 1500*10% = 450
    expect(result.subtotalMinor).toBe(4500);
    expect(result.taxMinor).toBe(450);
    expect(result.totalMinor).toBe(4500 - 200 + 450);
  });

  it("the canonical acceptance example: 50/day x 4 days x qty 1 x 23% VAT = 200.00 net / 46.00 VAT / 246.00 gross", () => {
    const items: EstimatedItemInput[] = [
      {
        billingMode: "DAILY",
        quantity: 1,
        dailyPriceMinor: 5000,
        discountMinor: 0,
        taxRateBp: 2300,
      },
    ];
    const result = estimateRentalTotals(items, "2026-08-01T00:00:00Z", "2026-08-05T00:00:00Z", 0);
    expect(result.subtotalMinor).toBe(20_000);
    expect(result.taxMinor).toBe(4600);
    expect(result.totalMinor).toBe(24_600);
  });
});

function priceDisplay(
  overrides: Partial<RentalItemPriceDisplayValues> = {},
): RentalItemPriceDisplayValues {
  return {
    billingMode: "DAILY",
    dailyPriceDisplay: "",
    weeklyPriceDisplay: "",
    monthlyPriceDisplay: "",
    customPriceDisplay: "",
    ...overrides,
  };
}

// Regression coverage for the manual-testing bug: a direct Rental with a
// MONTHLY item reached Review with a missing daily-remainder rate and
// failed at the API with the raw backend field name `dailyPriceMinor`.
// These mirror apps/api/src/rentals/rental-pricing.util.ts's
// assertBillingModePriceProvided field-by-field — unlike Quotes, Rental has
// no legacy escape hatch, so MONTHLY always requires both fields.
describe("getRequiredRentalItemPriceFields / getMissingRentalItemPriceFields", () => {
  it("requires only dailyPriceDisplay for DAILY", () => {
    expect(getRequiredRentalItemPriceFields("DAILY")).toEqual(["dailyPriceDisplay"]);
  });

  it("requires only weeklyPriceDisplay for WEEKLY", () => {
    expect(getRequiredRentalItemPriceFields("WEEKLY")).toEqual(["weeklyPriceDisplay"]);
  });

  it("requires both monthlyPriceDisplay and dailyPriceDisplay for MONTHLY", () => {
    expect(getRequiredRentalItemPriceFields("MONTHLY")).toEqual([
      "monthlyPriceDisplay",
      "dailyPriceDisplay",
    ]);
  });

  it("requires only customPriceDisplay for CUSTOM", () => {
    expect(getRequiredRentalItemPriceFields("CUSTOM")).toEqual(["customPriceDisplay"]);
  });

  it("flags a MONTHLY item as missing its daily remainder rate when only the monthly price is filled in — the exact manual-testing bug", () => {
    const item = priceDisplay({ billingMode: "MONTHLY", monthlyPriceDisplay: "500" });
    expect(getMissingRentalItemPriceFields(item)).toEqual(["dailyPriceDisplay"]);
  });

  it("flags a MONTHLY item as missing both prices when neither is filled in", () => {
    const item = priceDisplay({ billingMode: "MONTHLY" });
    expect(getMissingRentalItemPriceFields(item)).toEqual([
      "monthlyPriceDisplay",
      "dailyPriceDisplay",
    ]);
  });

  it("reports no missing fields for a fully-priced MONTHLY item, even when the daily remainder rate is explicitly zero", () => {
    const item = priceDisplay({
      billingMode: "MONTHLY",
      monthlyPriceDisplay: "500",
      dailyPriceDisplay: "0",
    });
    expect(getMissingRentalItemPriceFields(item)).toEqual([]);
  });

  it("reports no missing fields for a correctly-priced DAILY/WEEKLY/CUSTOM item", () => {
    expect(getMissingRentalItemPriceFields(priceDisplay({ dailyPriceDisplay: "50" }))).toEqual([]);
    expect(
      getMissingRentalItemPriceFields(
        priceDisplay({ billingMode: "WEEKLY", weeklyPriceDisplay: "300" }),
      ),
    ).toEqual([]);
    expect(
      getMissingRentalItemPriceFields(
        priceDisplay({ billingMode: "CUSTOM", customPriceDisplay: "1200" }),
      ),
    ).toEqual([]);
  });
});
