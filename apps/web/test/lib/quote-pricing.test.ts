import { describe, expect, it } from "vitest";

import { estimateMonthsInRange } from "../../src/lib/rental-pricing";
import {
  estimateDurationInDays,
  estimateQuoteItemPricing,
  estimateQuoteTotals,
  getMissingQuoteItemPriceFields,
  getRequiredQuoteItemPriceFields,
  type EstimatedQuoteItemInput,
  type QuoteItemPriceDisplayValues,
} from "../../src/lib/quote-pricing";

function item(overrides: Partial<EstimatedQuoteItemInput> = {}): EstimatedQuoteItemInput {
  return { billingMode: "FLAT", quantity: 1, ...overrides };
}

describe("estimateDurationInDays", () => {
  it("rounds up a partial day and floors at 1", () => {
    expect(estimateDurationInDays("2026-08-01T00:00:00Z", "2026-08-01T12:00:00Z")).toBe(1);
  });

  it("computes a clean multi-day span", () => {
    expect(estimateDurationInDays("2026-08-01T00:00:00Z", "2026-08-08T00:00:00Z")).toBe(7);
  });

  it("returns 0 for missing or invalid dates", () => {
    expect(estimateDurationInDays("", "")).toBe(0);
  });
});

describe("estimateMonthsInRange", () => {
  it("handles Jan 31 -> Feb 28 (non-leap year)", () => {
    expect(estimateMonthsInRange("2027-01-31T00:00:00Z", "2027-02-28T00:00:00Z")).toBe(1);
  });

  it("handles Jan 31 -> Feb 29 (leap year)", () => {
    expect(estimateMonthsInRange("2028-01-31T00:00:00Z", "2028-02-29T00:00:00Z")).toBe(1);
  });

  it("handles Aug 31 -> Sep 30", () => {
    expect(estimateMonthsInRange("2026-08-31T00:00:00Z", "2026-09-30T00:00:00Z")).toBe(1);
  });
});

describe("estimateQuoteItemPricing", () => {
  it("computes FLAT pricing as unitPrice * quantity, ignoring duration", () => {
    const result = estimateQuoteItemPricing(
      item({ billingMode: "FLAT", unitPriceMinor: 1000, quantity: 3 }),
      "2026-08-01T00:00:00Z",
      "2026-12-01T00:00:00Z",
    );
    expect(result.lineSubtotalMinor).toBe(3000);
  });

  it("computes DAILY pricing across a multi-day span", () => {
    const result = estimateQuoteItemPricing(
      item({ billingMode: "DAILY", dailyPriceMinor: 1000 }),
      "2026-08-01T00:00:00Z",
      "2026-08-04T00:00:00Z",
    );
    expect(result.lineSubtotalMinor).toBe(3000);
  });

  it("computes MONTHLY pricing under CALENDAR_MONTH: complete months plus a daily-priced remainder", () => {
    const result = estimateQuoteItemPricing(
      item({
        billingMode: "MONTHLY",
        monthlyPriceMinor: 20000,
        dailyPriceMinor: 1000,
        monthlyBillingStrategy: "CALENDAR_MONTH",
      }),
      "2026-01-15T00:00:00Z",
      "2026-03-20T00:00:00Z",
    );
    expect(result.lineSubtotalMinor).toBe(20000 * 2 + 1000 * 5);
  });

  it("computes MONTHLY pricing under FIXED_30_DAYS", () => {
    const result = estimateQuoteItemPricing(
      item({
        billingMode: "MONTHLY",
        monthlyPriceMinor: 30000,
        dailyPriceMinor: 900,
        monthlyBillingStrategy: "FIXED_30_DAYS",
      }),
      "2026-01-01T00:00:00Z",
      "2026-03-07T00:00:00Z", // 65 days
    );
    expect(result.lineSubtotalMinor).toBe(30000 * 2 + 900 * 5);
  });

  it("computes MONTHLY pricing under CUSTOM", () => {
    const result = estimateQuoteItemPricing(
      item({
        billingMode: "MONTHLY",
        monthlyPriceMinor: 28000,
        dailyPriceMinor: 800,
        monthlyBillingStrategy: "CUSTOM",
        customMonthLengthDays: 28,
      }),
      "2026-01-01T00:00:00Z",
      "2026-03-02T00:00:00Z", // 60 days
    );
    expect(result.lineSubtotalMinor).toBe(28000 * 2 + 800 * 4);
  });

  it("defaults to CALENDAR_MONTH when no strategy is provided (matches the tenant-wide default)", () => {
    const result = estimateQuoteItemPricing(
      item({
        billingMode: "MONTHLY",
        monthlyPriceMinor: 15000,
        dailyPriceMinor: 500,
      }),
      "2027-01-31T00:00:00Z",
      "2027-02-28T00:00:00Z",
    );
    expect(result.lineSubtotalMinor).toBe(15000);
  });

  it("applies a percentage discount before tax", () => {
    const result = estimateQuoteItemPricing(
      item({
        billingMode: "FLAT",
        unitPriceMinor: 10000,
        discountType: "PERCENTAGE",
        discountValue: 1000, // 10%
        taxRateBp: 2000, // 20%
      }),
      "2026-08-01T00:00:00Z",
      "2026-08-02T00:00:00Z",
    );
    // (10000 - 1000) * 1.20 = 10800
    expect(result.discountTotalMinor).toBe(1000);
    expect(result.taxTotalMinor).toBe(1800);
    expect(result.lineTotalMinor).toBe(10800);
  });
});

describe("estimateQuoteTotals", () => {
  it("sums line totals into subtotal and applies the quote-level discount", () => {
    const result = estimateQuoteTotals(
      [
        item({ billingMode: "FLAT", unitPriceMinor: 1000 }),
        item({ billingMode: "FLAT", unitPriceMinor: 2000 }),
      ],
      "2026-08-01T00:00:00Z",
      "2026-08-02T00:00:00Z",
      "FIXED",
      500,
    );
    expect(result.subtotalMinor).toBe(3000);
    expect(result.discountTotalMinor).toBe(500);
    expect(result.totalMinor).toBe(2500);
  });

  it("sums per-line deposits without adding them to the total", () => {
    const result = estimateQuoteTotals(
      [item({ billingMode: "FLAT", unitPriceMinor: 1000, depositMinor: 200 })],
      "2026-08-01T00:00:00Z",
      "2026-08-02T00:00:00Z",
      null,
      0,
    );
    expect(result.depositTotalMinor).toBe(200);
    expect(result.totalMinor).toBe(1000);
  });

  it("returns all zeros for an empty item list", () => {
    const result = estimateQuoteTotals([], "2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z", null, 0);
    expect(result.subtotalMinor).toBe(0);
    expect(result.totalMinor).toBe(0);
  });
});

function priceDisplay(
  overrides: Partial<QuoteItemPriceDisplayValues> = {},
): QuoteItemPriceDisplayValues {
  return {
    billingMode: "DAILY",
    unitPriceDisplay: "",
    dailyPriceDisplay: "",
    weeklyPriceDisplay: "",
    monthlyPriceDisplay: "",
    customPriceDisplay: "",
    ...overrides,
  };
}

// Regression coverage for the manual-testing bug: MONTHLY quote items
// reached Review with a missing daily-remainder rate and failed at the API
// with the raw backend field name `dailyPriceMinor`. These mirror
// apps/api/src/quotes/quote-pricing.util.ts's
// assertQuoteBillingModePriceProvided field-by-field.
describe("getRequiredQuoteItemPriceFields / getMissingQuoteItemPriceFields", () => {
  it("requires only dailyPriceDisplay for DAILY", () => {
    expect(getRequiredQuoteItemPriceFields("DAILY")).toEqual(["dailyPriceDisplay"]);
  });

  it("requires only weeklyPriceDisplay for WEEKLY", () => {
    expect(getRequiredQuoteItemPriceFields("WEEKLY")).toEqual(["weeklyPriceDisplay"]);
  });

  it("requires both monthlyPriceDisplay and dailyPriceDisplay for MONTHLY", () => {
    expect(getRequiredQuoteItemPriceFields("MONTHLY")).toEqual([
      "monthlyPriceDisplay",
      "dailyPriceDisplay",
    ]);
  });

  it("requires only customPriceDisplay for CUSTOM", () => {
    expect(getRequiredQuoteItemPriceFields("CUSTOM")).toEqual(["customPriceDisplay"]);
  });

  it("requires only unitPriceDisplay for FLAT", () => {
    expect(getRequiredQuoteItemPriceFields("FLAT")).toEqual(["unitPriceDisplay"]);
  });

  it("flags a MONTHLY item as missing its daily remainder rate when only the monthly price is filled in — the exact manual-testing bug", () => {
    const item = priceDisplay({ billingMode: "MONTHLY", monthlyPriceDisplay: "500" });
    expect(getMissingQuoteItemPriceFields(item)).toEqual(["dailyPriceDisplay"]);
  });

  it("flags a MONTHLY item as missing both prices when neither is filled in", () => {
    const item = priceDisplay({ billingMode: "MONTHLY" });
    expect(getMissingQuoteItemPriceFields(item)).toEqual([
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
    expect(getMissingQuoteItemPriceFields(item)).toEqual([]);
  });

  it("treats a whitespace-only value as missing", () => {
    const item = priceDisplay({
      billingMode: "MONTHLY",
      monthlyPriceDisplay: "500",
      dailyPriceDisplay: "   ",
    });
    expect(getMissingQuoteItemPriceFields(item)).toEqual(["dailyPriceDisplay"]);
  });

  it("reports no missing fields for a correctly-priced DAILY/WEEKLY/CUSTOM/FLAT item", () => {
    expect(getMissingQuoteItemPriceFields(priceDisplay({ dailyPriceDisplay: "50" }))).toEqual([]);
    expect(
      getMissingQuoteItemPriceFields(
        priceDisplay({ billingMode: "WEEKLY", weeklyPriceDisplay: "300" }),
      ),
    ).toEqual([]);
    expect(
      getMissingQuoteItemPriceFields(
        priceDisplay({ billingMode: "CUSTOM", customPriceDisplay: "1200" }),
      ),
    ).toEqual([]);
    expect(
      getMissingQuoteItemPriceFields(priceDisplay({ billingMode: "FLAT", unitPriceDisplay: "75" })),
    ).toEqual([]);
  });
});
