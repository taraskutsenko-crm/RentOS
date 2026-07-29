import { describe, expect, it } from "vitest";

import {
  estimateDurationInDays,
  estimateMonthsInRange,
  estimateQuoteItemPricing,
  estimateQuoteTotals,
  type EstimatedQuoteItemInput,
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
