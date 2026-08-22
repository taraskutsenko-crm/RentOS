import { BadRequestException } from "@nestjs/common";
import type { PartialMonthPolicy } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  applyPartialMonthPolicy,
  assertBillingModePriceProvided,
  computeItemLineTotalMinor,
  computeMonthlyBreakdown,
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

describe("computeMonthlyBreakdown (CALENDAR_MONTH)", () => {
  function breakdown(from: string, to: string) {
    return computeMonthlyBreakdown("CALENDAR_MONTH", null, new Date(from), new Date(to));
  }

  it("Jan 1 -> Feb 1: 1 complete month, 0 remaining days", () => {
    expect(breakdown("2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z")).toEqual({
      strategy: "CALENDAR_MONTH",
      customMonthLengthDays: null,
      completeUnits: 1,
      remainingDays: 0,
    });
  });

  it("Feb 1 -> Mar 1: 1 complete month, 0 remaining days", () => {
    expect(breakdown("2026-02-01T00:00:00Z", "2026-03-01T00:00:00Z")).toMatchObject({
      completeUnits: 1,
      remainingDays: 0,
    });
  });

  it("Jan 31 -> Feb 28: 1 complete month in a non-leap year, 0 remaining days", () => {
    expect(breakdown("2027-01-31T00:00:00Z", "2027-02-28T00:00:00Z")).toMatchObject({
      completeUnits: 1,
      remainingDays: 0,
    });
  });

  it("Jan 31 -> Feb 29: 1 complete month in a leap year, 0 remaining days", () => {
    expect(breakdown("2028-01-31T00:00:00Z", "2028-02-29T00:00:00Z")).toMatchObject({
      completeUnits: 1,
      remainingDays: 0,
    });
  });

  it("distinguishes a non-leap-year February from a leap-year one at the same anchor", () => {
    // Jan 31 + 1 month clamps to Feb 28 in 2027 (non-leap) but Feb 29 in 2028 (leap) —
    // both fully consumed as 1 complete month with 0 remainder either way.
    expect(breakdown("2027-01-31T00:00:00Z", "2027-03-01T00:00:00Z")).toMatchObject({
      completeUnits: 1,
      remainingDays: 1, // Feb 28 -> Mar 1
    });
    expect(breakdown("2028-01-31T00:00:00Z", "2028-03-01T00:00:00Z")).toMatchObject({
      completeUnits: 1,
      remainingDays: 1, // Feb 29 -> Mar 1
    });
  });

  it("Aug 31 -> Sep 30: 1 complete month, 0 remaining days", () => {
    expect(breakdown("2026-08-31T00:00:00Z", "2026-09-30T00:00:00Z")).toMatchObject({
      completeUnits: 1,
      remainingDays: 0,
    });
  });

  it("handles multiple full months without drifting (Jan 31 -> Apr 30)", () => {
    // Jan31+1mo=Feb28, +2mo=Mar31, +3mo=Apr30 (matches end exactly)
    expect(breakdown("2026-01-31T00:00:00Z", "2026-04-30T00:00:00Z")).toMatchObject({
      completeUnits: 3,
      remainingDays: 0,
    });
  });

  it("splits complete months plus remaining days (Jan 15 -> Mar 20)", () => {
    // Jan15+2mo=Mar15 (<=end), Jan15+3mo=Apr15 (>end) -> 2 months + 5 days
    expect(breakdown("2026-01-15T00:00:00Z", "2026-03-20T00:00:00Z")).toEqual({
      strategy: "CALENDAR_MONTH",
      customMonthLengthDays: null,
      completeUnits: 2,
      remainingDays: 5,
    });
  });

  it("treats a same-instant range as 0 complete months and 0 remaining days", () => {
    expect(breakdown("2026-08-01T00:00:00Z", "2026-08-01T00:00:00Z")).toMatchObject({
      completeUnits: 0,
      remainingDays: 0,
    });
  });

  it("treats a minimum valid period (a few hours, same calendar day) as 0 months and 1 remaining day", () => {
    // Rentals require plannedEnd > plannedStart; a short same-day span still
    // rounds up to 1 billable day, matching durationInDays' rounding rule.
    expect(breakdown("2026-08-01T09:00:00Z", "2026-08-01T17:00:00Z")).toMatchObject({
      completeUnits: 0,
      remainingDays: 1,
    });
  });

  it("crosses a year boundary correctly (Dec 15 -> Jan 15)", () => {
    expect(breakdown("2026-12-15T00:00:00Z", "2027-01-15T00:00:00Z")).toMatchObject({
      completeUnits: 1,
      remainingDays: 0,
    });
  });

  it("is timezone/DST-safe: identical results regardless of a fixed non-midnight UTC time-of-day", () => {
    const withTime = breakdown("2026-01-15T13:45:30Z", "2026-03-20T13:45:30Z");
    expect(withTime).toMatchObject({ completeUnits: 2, remainingDays: 5 });
  });
});

describe("computeMonthlyBreakdown (FIXED_30_DAYS)", () => {
  function breakdown(days: number) {
    const start30 = new Date("2026-01-01T00:00:00Z");
    const end30 = new Date(start30.getTime() + days * 24 * 60 * 60 * 1000);
    return computeMonthlyBreakdown("FIXED_30_DAYS", null, start30, end30);
  }

  it("exactly 30 days -> 1 unit, 0 remaining", () => {
    expect(breakdown(30)).toMatchObject({ completeUnits: 1, remainingDays: 0 });
  });

  it("29 days -> 0 units, 29 remaining", () => {
    expect(breakdown(29)).toMatchObject({ completeUnits: 0, remainingDays: 29 });
  });

  it("31 days -> 1 unit, 1 remaining", () => {
    expect(breakdown(31)).toMatchObject({ completeUnits: 1, remainingDays: 1 });
  });

  it("60 days -> 2 units, 0 remaining", () => {
    expect(breakdown(60)).toMatchObject({ completeUnits: 2, remainingDays: 0 });
  });

  it("65 days -> 2 units, 5 remaining", () => {
    expect(breakdown(65)).toMatchObject({ completeUnits: 2, remainingDays: 5 });
  });
});

describe("computeMonthlyBreakdown (CUSTOM)", () => {
  const start28 = new Date("2026-01-01T00:00:00Z");
  function endAfter(days: number): Date {
    return new Date(start28.getTime() + days * 24 * 60 * 60 * 1000);
  }

  it("28-day custom period, exactly one period -> 1 unit, 0 remaining", () => {
    expect(computeMonthlyBreakdown("CUSTOM", 28, start28, endAfter(28))).toMatchObject({
      completeUnits: 1,
      remainingDays: 0,
    });
  });

  it("multiple custom periods (60 days, length 28) -> 2 units, 4 remaining", () => {
    expect(computeMonthlyBreakdown("CUSTOM", 28, start28, endAfter(60))).toEqual({
      strategy: "CUSTOM",
      customMonthLengthDays: 28,
      completeUnits: 2,
      remainingDays: 4,
    });
  });

  it("remaining days shorter than one custom period -> 0 units", () => {
    expect(computeMonthlyBreakdown("CUSTOM", 28, start28, endAfter(10))).toMatchObject({
      completeUnits: 0,
      remainingDays: 10,
    });
  });

  it("rejects customMonthLengthDays = 0", () => {
    expect(() => computeMonthlyBreakdown("CUSTOM", 0, start28, endAfter(10))).toThrow(
      BadRequestException,
    );
  });

  it("rejects a negative customMonthLengthDays", () => {
    expect(() => computeMonthlyBreakdown("CUSTOM", -5, start28, endAfter(10))).toThrow(
      BadRequestException,
    );
  });

  it("rejects customMonthLengthDays over 365", () => {
    expect(() => computeMonthlyBreakdown("CUSTOM", 366, start28, endAfter(10))).toThrow(
      BadRequestException,
    );
  });

  it("rejects a decimal customMonthLengthDays", () => {
    expect(() => computeMonthlyBreakdown("CUSTOM", 28.5, start28, endAfter(10))).toThrow(
      BadRequestException,
    );
  });

  it("rejects a missing customMonthLengthDays", () => {
    expect(() => computeMonthlyBreakdown("CUSTOM", null, start28, endAfter(10))).toThrow(
      BadRequestException,
    );
    expect(() => computeMonthlyBreakdown("CUSTOM", undefined, start28, endAfter(10))).toThrow(
      BadRequestException,
    );
  });

  it("accepts the boundary values 1 and 365", () => {
    expect(() => computeMonthlyBreakdown("CUSTOM", 1, start28, endAfter(10))).not.toThrow();
    expect(() => computeMonthlyBreakdown("CUSTOM", 365, start28, endAfter(10))).not.toThrow();
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

  it("computes a MONTHLY line total under CALENDAR_MONTH: complete months at monthlyPrice plus remaining days at dailyPrice", () => {
    // Aug 1 -> Sep 15: 1 complete month (Aug1->Sep1) + 14 remaining days
    const end = new Date("2026-09-15T00:00:00Z");
    const result = computeItemLineTotalMinor(
      item({
        billingMode: "MONTHLY",
        monthlyPriceMinor: 20000,
        dailyPriceMinor: 1000,
        monthlyBillingStrategy: "CALENDAR_MONTH",
      }),
      start,
      end,
    );
    expect(result).toBe(20000 * 1 + 1000 * 14);
  });

  it("computes a MONTHLY line total across a calendar-month-exact span (Jan 31 -> Feb 28), no remainder", () => {
    const monthlyStart = new Date("2027-01-31T00:00:00Z");
    const end = new Date("2027-02-28T00:00:00Z");
    const result = computeItemLineTotalMinor(
      item({
        billingMode: "MONTHLY",
        monthlyPriceMinor: 15000,
        dailyPriceMinor: 500,
        monthlyBillingStrategy: "CALENDAR_MONTH",
      }),
      monthlyStart,
      end,
    );
    expect(result).toBe(15000);
  });

  it("computes a MONTHLY line total under FIXED_30_DAYS", () => {
    // 65 days -> 2 x 30-day units + 5 remaining days
    const end = new Date("2026-10-05T00:00:00Z");
    const result = computeItemLineTotalMinor(
      item({
        billingMode: "MONTHLY",
        monthlyPriceMinor: 30000,
        dailyPriceMinor: 900,
        monthlyBillingStrategy: "FIXED_30_DAYS",
      }),
      start,
      end,
    );
    expect(result).toBe(30000 * 2 + 900 * 5);
  });

  it("computes a MONTHLY line total under CUSTOM", () => {
    // 60 days, customMonthLengthDays=28 -> 2 units + 4 remaining days
    const end = new Date("2026-09-30T00:00:00Z");
    const result = computeItemLineTotalMinor(
      item({
        billingMode: "MONTHLY",
        monthlyPriceMinor: 28000,
        dailyPriceMinor: 800,
        monthlyBillingStrategy: "CUSTOM",
        customMonthLengthDays: 28,
      }),
      start,
      end,
    );
    expect(result).toBe(28000 * 2 + 800 * 4);
  });

  it("throws when MONTHLY is missing dailyPriceMinor (needed for any remainder)", () => {
    const end = new Date("2026-09-15T00:00:00Z");
    expect(() =>
      computeItemLineTotalMinor(
        item({
          billingMode: "MONTHLY",
          monthlyPriceMinor: 20000,
          monthlyBillingStrategy: "CALENDAR_MONTH",
        }),
        start,
        end,
      ),
    ).toThrow(BadRequestException);
  });

  it("throws when MONTHLY is missing monthlyBillingStrategy", () => {
    const end = new Date("2026-09-15T00:00:00Z");
    expect(() =>
      computeItemLineTotalMinor(
        item({ billingMode: "MONTHLY", monthlyPriceMinor: 20000, dailyPriceMinor: 1000 }),
        start,
        end,
      ),
    ).toThrow(BadRequestException);
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

describe("applyPartialMonthPolicy", () => {
  it("PRORATE_BY_DAY: complete units at monthlyPrice plus remaining days at dailyPrice", () => {
    expect(
      applyPartialMonthPolicy(
        { completeUnits: 1, remainingDays: 14 },
        20000,
        1000,
        "PRORATE_BY_DAY",
      ),
    ).toBe(20000 * 1 + 1000 * 14);
  });

  it("PRORATE_BY_DAY with no remaining days ignores dailyPriceMinor entirely", () => {
    expect(
      applyPartialMonthPolicy(
        { completeUnits: 2, remainingDays: 0 },
        20000,
        null,
        "PRORATE_BY_DAY",
      ),
    ).toBe(40000);
  });

  it("ROUND_UP_TO_FULL_MONTH: any started remaining period counts as one more full unit", () => {
    expect(
      applyPartialMonthPolicy(
        { completeUnits: 1, remainingDays: 14 },
        20000,
        null,
        "ROUND_UP_TO_FULL_MONTH",
      ),
    ).toBe(20000 * 2);
  });

  it("ROUND_UP_TO_FULL_MONTH never reads dailyPriceMinor, even if provided", () => {
    expect(
      applyPartialMonthPolicy(
        { completeUnits: 1, remainingDays: 1 },
        20000,
        999_999_999,
        "ROUND_UP_TO_FULL_MONTH",
      ),
    ).toBe(20000 * 2);
  });

  it("ROUND_UP_TO_FULL_MONTH with 0 remaining days charges exactly the complete units, no rounding up", () => {
    expect(
      applyPartialMonthPolicy(
        { completeUnits: 2, remainingDays: 0 },
        20000,
        null,
        "ROUND_UP_TO_FULL_MONTH",
      ),
    ).toBe(40000);
  });

  it("a null/undefined policy behaves exactly like PRORATE_BY_DAY (legacy rows)", () => {
    const breakdown = { completeUnits: 1, remainingDays: 14 };
    expect(applyPartialMonthPolicy(breakdown, 20000, 1000, null)).toBe(
      applyPartialMonthPolicy(breakdown, 20000, 1000, "PRORATE_BY_DAY"),
    );
    expect(applyPartialMonthPolicy(breakdown, 20000, 1000, undefined)).toBe(
      applyPartialMonthPolicy(breakdown, 20000, 1000, "PRORATE_BY_DAY"),
    );
  });
});

describe("assertBillingModePriceProvided (partial-month policy interaction)", () => {
  function monthlyItem(overrides: Partial<PricedRentalItemInput> = {}): PricedRentalItemInput {
    return {
      billingMode: "MONTHLY",
      quantity: 1,
      discountMinor: 0,
      monthlyPriceMinor: 60000,
      monthlyBillingStrategy: "CALENDAR_MONTH",
      ...overrides,
    };
  }

  it("PRORATE_BY_DAY requires dailyPriceMinor", () => {
    expect(() =>
      assertBillingModePriceProvided(monthlyItem({ partialMonthPolicy: "PRORATE_BY_DAY" })),
    ).toThrow(BadRequestException);
    expect(() =>
      assertBillingModePriceProvided(
        monthlyItem({ partialMonthPolicy: "PRORATE_BY_DAY", dailyPriceMinor: 2000 }),
      ),
    ).not.toThrow();
  });

  it("a missing/legacy partialMonthPolicy defaults to PRORATE_BY_DAY and still requires dailyPriceMinor", () => {
    expect(() => assertBillingModePriceProvided(monthlyItem())).toThrow(BadRequestException);
  });

  it("ROUND_UP_TO_FULL_MONTH never requires dailyPriceMinor", () => {
    expect(() =>
      assertBillingModePriceProvided(monthlyItem({ partialMonthPolicy: "ROUND_UP_TO_FULL_MONTH" })),
    ).not.toThrow();
  });

  it("ROUND_UP_TO_FULL_MONTH still requires monthlyPriceMinor", () => {
    expect(() =>
      assertBillingModePriceProvided(
        monthlyItem({ partialMonthPolicy: "ROUND_UP_TO_FULL_MONTH", monthlyPriceMinor: null }),
      ),
    ).toThrow(BadRequestException);
  });
});

describe("computeItemLineTotalMinor: MONTHLY partial-month policy regression matrix (600 PLN/month, 18 Aug start)", () => {
  const monthlyStart = new Date("2026-08-18T00:00:00Z");
  const monthlyPriceMinor = 60000; // 600.00 PLN in minor units
  const dailyPriceMinor = 2000; // 20.00 PLN/day remainder rate

  function endAfterDays(days: number): Date {
    return new Date(monthlyStart.getTime() + days * 24 * 60 * 60 * 1000);
  }

  function monthlyItem(partialMonthPolicy: PartialMonthPolicy): PricedRentalItemInput {
    return {
      billingMode: "MONTHLY",
      quantity: 1,
      discountMinor: 0,
      monthlyPriceMinor,
      dailyPriceMinor,
      monthlyBillingStrategy: "CALENDAR_MONTH",
      partialMonthPolicy,
    };
  }

  it("exactly 1 month (18 Aug -> 18 Sep): both policies charge exactly one full month, no remainder", () => {
    const end = endAfterDays(31); // Aug has 31 days: 18 Aug -> 18 Sep is exactly 1 calendar month
    expect(computeItemLineTotalMinor(monthlyItem("PRORATE_BY_DAY"), monthlyStart, end)).toBe(
      monthlyPriceMinor,
    );
    expect(
      computeItemLineTotalMinor(monthlyItem("ROUND_UP_TO_FULL_MONTH"), monthlyStart, end),
    ).toBe(monthlyPriceMinor);
  });

  it("1 month + 1 day: PRORATE_BY_DAY charges 1 day extra, ROUND_UP_TO_FULL_MONTH charges a full 2nd month", () => {
    const end = new Date("2026-09-19T00:00:00Z"); // 18 Sep + 1 day
    expect(computeItemLineTotalMinor(monthlyItem("PRORATE_BY_DAY"), monthlyStart, end)).toBe(
      monthlyPriceMinor + dailyPriceMinor * 1,
    );
    expect(
      computeItemLineTotalMinor(monthlyItem("ROUND_UP_TO_FULL_MONTH"), monthlyStart, end),
    ).toBe(monthlyPriceMinor * 2);
  });

  it("1 month + 11 days: PRORATE_BY_DAY charges 11 days extra, ROUND_UP_TO_FULL_MONTH still only charges 2 full months", () => {
    const end = new Date("2026-09-29T00:00:00Z"); // 18 Sep + 11 days
    expect(computeItemLineTotalMinor(monthlyItem("PRORATE_BY_DAY"), monthlyStart, end)).toBe(
      monthlyPriceMinor + dailyPriceMinor * 11,
    );
    expect(
      computeItemLineTotalMinor(monthlyItem("ROUND_UP_TO_FULL_MONTH"), monthlyStart, end),
    ).toBe(monthlyPriceMinor * 2);
  });

  it("almost 2 months (18 Sep -> 17 Oct, one day short): PRORATE_BY_DAY charges the September-length remainder, ROUND_UP_TO_FULL_MONTH still rounds up to 2 full months", () => {
    const end = new Date("2026-10-17T00:00:00Z"); // 1 day short of 18 Oct (2 full calendar months)
    // 1 complete month (Aug18->Sep18) + 29 remaining days (Sep18->Oct17, September has 30 days)
    expect(computeItemLineTotalMinor(monthlyItem("PRORATE_BY_DAY"), monthlyStart, end)).toBe(
      monthlyPriceMinor + dailyPriceMinor * 29,
    );
    expect(
      computeItemLineTotalMinor(monthlyItem("ROUND_UP_TO_FULL_MONTH"), monthlyStart, end),
    ).toBe(monthlyPriceMinor * 2);
  });

  it("exactly 2 months (18 Aug -> 18 Oct): both policies charge exactly two full months, no remainder", () => {
    const end = new Date("2026-10-18T00:00:00Z");
    expect(computeItemLineTotalMinor(monthlyItem("PRORATE_BY_DAY"), monthlyStart, end)).toBe(
      monthlyPriceMinor * 2,
    );
    expect(
      computeItemLineTotalMinor(monthlyItem("ROUND_UP_TO_FULL_MONTH"), monthlyStart, end),
    ).toBe(monthlyPriceMinor * 2);
  });

  it("ROUND_UP_TO_FULL_MONTH never throws for a missing dailyPriceMinor", () => {
    const end = endAfterDays(45);
    expect(() =>
      computeItemLineTotalMinor(
        { ...monthlyItem("ROUND_UP_TO_FULL_MONTH"), dailyPriceMinor: null },
        monthlyStart,
        end,
      ),
    ).not.toThrow();
  });

  it("PRORATE_BY_DAY throws when dailyPriceMinor is missing and there is a remainder", () => {
    const end = endAfterDays(45);
    expect(() =>
      computeItemLineTotalMinor(
        { ...monthlyItem("PRORATE_BY_DAY"), dailyPriceMinor: null },
        monthlyStart,
        end,
      ),
    ).toThrow(BadRequestException);
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
