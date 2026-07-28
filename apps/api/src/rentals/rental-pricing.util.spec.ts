import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  computeItemLineTotalMinor,
  computeRentalTotals,
  durationInDays,
  monthsInRange,
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

describe("monthsInRange", () => {
  it("Jan 1 -> Feb 1 is exactly 1 calendar month", () => {
    expect(monthsInRange(new Date("2026-01-01T00:00:00Z"), new Date("2026-02-01T00:00:00Z"))).toBe(
      1,
    );
  });

  it("Feb 1 -> Mar 1 is exactly 1 calendar month", () => {
    expect(monthsInRange(new Date("2026-02-01T00:00:00Z"), new Date("2026-03-01T00:00:00Z"))).toBe(
      1,
    );
  });

  it("Mar 15 -> Apr 15 is exactly 1 calendar month", () => {
    expect(monthsInRange(new Date("2026-03-15T00:00:00Z"), new Date("2026-04-15T00:00:00Z"))).toBe(
      1,
    );
  });

  it("Jan 31 -> Feb 28 is exactly 1 calendar month in a non-leap year", () => {
    expect(monthsInRange(new Date("2027-01-31T00:00:00Z"), new Date("2027-02-28T00:00:00Z"))).toBe(
      1,
    );
  });

  it("Jan 31 -> Feb 29 is exactly 1 calendar month in a leap year", () => {
    expect(monthsInRange(new Date("2028-01-31T00:00:00Z"), new Date("2028-02-29T00:00:00Z"))).toBe(
      1,
    );
  });

  it("Aug 31 -> Sep 30 is exactly 1 calendar month", () => {
    expect(monthsInRange(new Date("2026-08-31T00:00:00Z"), new Date("2026-09-30T00:00:00Z"))).toBe(
      1,
    );
  });

  it("does not drift across a multi-month span anchored on a 31st", () => {
    // Jan 31 -> Apr 30: Jan31+1mo=Feb28, +2mo=Mar31, +3mo=Apr30 (matches end exactly) -> 3 months
    expect(monthsInRange(new Date("2026-01-31T00:00:00Z"), new Date("2026-04-30T00:00:00Z"))).toBe(
      3,
    );
  });

  it("rounds up a partial month", () => {
    // Jan 1 -> Mar 5: 2 full months (Jan1->Mar1) plus a few days -> 3rd month started
    expect(monthsInRange(new Date("2026-01-01T00:00:00Z"), new Date("2026-03-05T00:00:00Z"))).toBe(
      3,
    );
  });

  it("counts a same-instant range as 1 month, never 0", () => {
    expect(monthsInRange(start, start)).toBe(1);
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

  it("computes a MONTHLY line total: unitPrice * calendar-months(start, end) * quantity", () => {
    // Aug 1 -> Sep 15: Aug1+1mo=Sep1 (< end), Aug1+2mo=Oct1 (>= end) -> 2 months
    const end = new Date("2026-09-15T00:00:00Z");
    const result = computeItemLineTotalMinor(
      item({ billingMode: "MONTHLY", monthlyPriceMinor: 20000 }),
      start,
      end,
    );
    expect(result).toBe(20000 * 2);
  });

  it("computes a MONTHLY line total across a calendar-month-exact span (Jan 31 -> Feb 28)", () => {
    const monthlyStart = new Date("2027-01-31T00:00:00Z");
    const end = new Date("2027-02-28T00:00:00Z");
    const result = computeItemLineTotalMinor(
      item({ billingMode: "MONTHLY", monthlyPriceMinor: 15000 }),
      monthlyStart,
      end,
    );
    expect(result).toBe(15000);
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
