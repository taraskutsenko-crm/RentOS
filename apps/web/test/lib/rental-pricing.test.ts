import { describe, expect, it } from "vitest";

import { estimateItemLineTotalMinor, estimateRentalTotals } from "../../src/lib/rental-pricing";
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
