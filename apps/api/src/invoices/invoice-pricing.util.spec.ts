import { describe, expect, it } from "vitest";

import {
  computeInvoiceItemPricing,
  computeInvoiceTotals,
  type PricedInvoiceItemInput,
} from "./invoice-pricing.util";

function item(overrides: Partial<PricedInvoiceItemInput> = {}): PricedInvoiceItemInput {
  return { quantity: 1, unitNetPriceMinor: 0, taxRateBp: 0, ...overrides };
}

describe("computeInvoiceItemPricing", () => {
  it("computes net/tax/gross for a simple quantity * unit price line with 23% VAT", () => {
    const result = computeInvoiceItemPricing(
      item({ quantity: 1, unitNetPriceMinor: 80_000, taxRateBp: 2300 }),
    );
    expect(result).toEqual({
      netTotalMinor: 80_000,
      taxTotalMinor: 18_400,
      grossTotalMinor: 98_400,
    });
  });

  it("multiplies unit price by quantity before applying discount and tax", () => {
    const result = computeInvoiceItemPricing(
      item({ quantity: 3, unitNetPriceMinor: 1_000, taxRateBp: 2000 }),
    );
    expect(result).toEqual({ netTotalMinor: 3_000, taxTotalMinor: 600, grossTotalMinor: 3_600 });
  });

  it("subtracts the discount before computing tax", () => {
    const result = computeInvoiceItemPricing(
      item({ quantity: 1, unitNetPriceMinor: 10_000, discountMinor: 2_000, taxRateBp: 2300 }),
    );
    // net = 10000 - 2000 = 8000; tax = round(8000 * 0.23) = 1840
    expect(result).toEqual({ netTotalMinor: 8_000, taxTotalMinor: 1_840, grossTotalMinor: 9_840 });
  });

  it("clamps a discount larger than the line subtotal to zero net", () => {
    const result = computeInvoiceItemPricing(
      item({ quantity: 1, unitNetPriceMinor: 500, discountMinor: 10_000, taxRateBp: 2000 }),
    );
    expect(result).toEqual({ netTotalMinor: 0, taxTotalMinor: 0, grossTotalMinor: 0 });
  });

  it("returns zero tax when taxRateBp is 0", () => {
    const result = computeInvoiceItemPricing(item({ quantity: 2, unitNetPriceMinor: 500 }));
    expect(result).toEqual({ netTotalMinor: 1_000, taxTotalMinor: 0, grossTotalMinor: 1_000 });
  });
});

describe("computeInvoiceTotals", () => {
  it("aggregates subtotal/discount/tax/total across multiple lines", () => {
    const totals = computeInvoiceTotals([
      item({ quantity: 1, unitNetPriceMinor: 80_000, taxRateBp: 2300 }),
      item({ quantity: 1, unitNetPriceMinor: 5_000, discountMinor: 1_000, taxRateBp: 2300 }),
    ]);

    // Line 1: net 80000, tax 18400, gross 98400
    // Line 2: net 4000 (5000-1000), tax round(4000*0.23)=920, gross 4920
    expect(totals.subtotalMinor).toBe(84_000);
    expect(totals.discountMinor).toBe(1_000);
    expect(totals.taxMinor).toBe(19_320);
    expect(totals.totalMinor).toBe(103_320);
    expect(totals.items).toHaveLength(2);
  });

  it("returns all-zero totals for an empty item list", () => {
    const totals = computeInvoiceTotals([]);
    expect(totals).toEqual({
      items: [],
      subtotalMinor: 0,
      discountMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
    });
  });

  it("never produces a negative total even with over-large discounts", () => {
    const totals = computeInvoiceTotals([
      item({ quantity: 1, unitNetPriceMinor: 1_000, discountMinor: 5_000, taxRateBp: 2000 }),
    ]);
    expect(totals.totalMinor).toBe(0);
    expect(totals.taxMinor).toBe(0);
  });
});
