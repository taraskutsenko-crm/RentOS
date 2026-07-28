import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  computeItemLineTotalMinor,
  computeRentalTotals,
  durationInDays,
  type PricedRentalItemInput,
} from "./rental-pricing.util";

const start = new Date("2026-08-01T00:00:00Z");

describe("durationInDays", () => {
  it("counts a same-day rental as 1 day, never 0", () => {
    expect(durationInDays(start, start)).toBe(1);
  });

  it("rounds up a partial day", () => {
    const end = new Date("2026-08-01T12:00:00Z");
    expect(durationInDays(start, end)).toBe(1);
  });

  it("computes a clean multi-day span", () => {
    const end = new Date("2026-08-08T00:00:00Z");
    expect(durationInDays(start, end)).toBe(7);
  });
});

describe("computeItemLineTotalMinor", () => {
  function item(overrides: Partial<PricedRentalItemInput> = {}): PricedRentalItemInput {
    return { billingMode: "DAILY", quantity: 1, discountMinor: 0, ...overrides };
  }

  it("computes a DAILY line total: unitPrice * days * quantity", () => {
    const end = new Date("2026-08-04T00:00:00Z"); // 3 days
    const result = computeItemLineTotalMinor(
      item({ billingMode: "DAILY", dailyPriceMinor: 1000, quantity: 2 }),
      start,
      end,
    );
    expect(result).toBe(1000 * 3 * 2);
  });

  it("computes a WEEKLY line total: unitPrice * ceil(days/7) * quantity", () => {
    const end = new Date("2026-08-10T00:00:00Z"); // 9 days -> 2 weeks
    const result = computeItemLineTotalMinor(
      item({ billingMode: "WEEKLY", weeklyPriceMinor: 5000 }),
      start,
      end,
    );
    expect(result).toBe(5000 * 2);
  });

  it("computes a MONTHLY line total: unitPrice * ceil(days/30) * quantity", () => {
    const end = new Date("2026-09-15T00:00:00Z"); // 45 days -> 2 months (30-day simplification)
    const result = computeItemLineTotalMinor(
      item({ billingMode: "MONTHLY", monthlyPriceMinor: 20000 }),
      start,
      end,
    );
    expect(result).toBe(20000 * 2);
  });

  it("computes a CUSTOM line total as a flat price, ignoring duration and quantity", () => {
    const end = new Date("2026-12-01T00:00:00Z");
    const result = computeItemLineTotalMinor(
      item({ billingMode: "CUSTOM", customPriceMinor: 99999, quantity: 5 }),
      start,
      end,
    );
    expect(result).toBe(99999);
  });

  it("subtracts the item's own discount", () => {
    const end = new Date("2026-08-02T00:00:00Z");
    const result = computeItemLineTotalMinor(
      item({ billingMode: "DAILY", dailyPriceMinor: 1000, discountMinor: 300 }),
      start,
      end,
    );
    expect(result).toBe(700);
  });

  it("floors the line total at 0 (never negative)", () => {
    const end = new Date("2026-08-02T00:00:00Z");
    const result = computeItemLineTotalMinor(
      item({ billingMode: "DAILY", dailyPriceMinor: 100, discountMinor: 10_000 }),
      start,
      end,
    );
    expect(result).toBe(0);
  });

  it("throws when the price field matching billingMode is missing", () => {
    const end = new Date("2026-08-02T00:00:00Z");
    expect(() => computeItemLineTotalMinor(item({ billingMode: "DAILY" }), start, end)).toThrow(
      BadRequestException,
    );
  });
});

describe("computeRentalTotals", () => {
  it("sums item line totals into subtotal, then applies rental-level discount and tax", () => {
    const end = new Date("2026-08-04T00:00:00Z"); // 3 days
    const items: PricedRentalItemInput[] = [
      { billingMode: "DAILY", quantity: 1, dailyPriceMinor: 1000, discountMinor: 0 },
      { billingMode: "DAILY", quantity: 1, dailyPriceMinor: 500, discountMinor: 0 },
    ];
    // subtotal = (1000*3) + (500*3) = 4500
    const result = computeRentalTotals(items, start, end, 500, 200);
    expect(result.subtotalMinor).toBe(4500);
    expect(result.totalMinor).toBe(4500 - 500 + 200);
  });

  it("floors the grand total at 0", () => {
    const end = new Date("2026-08-02T00:00:00Z");
    const items: PricedRentalItemInput[] = [
      { billingMode: "DAILY", quantity: 1, dailyPriceMinor: 100, discountMinor: 0 },
    ];
    const result = computeRentalTotals(items, start, end, 10_000, 0);
    expect(result.totalMinor).toBe(0);
  });

  it("returns a 0 subtotal for an empty item list", () => {
    const end = new Date("2026-08-02T00:00:00Z");
    const result = computeRentalTotals([], start, end, 0, 0);
    expect(result.subtotalMinor).toBe(0);
    expect(result.totalMinor).toBe(0);
  });
});
