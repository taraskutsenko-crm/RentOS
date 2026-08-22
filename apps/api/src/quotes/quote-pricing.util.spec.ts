import { BadRequestException } from "@nestjs/common";
import type { PartialMonthPolicy } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  computeQuoteItemPricing,
  computeQuoteTotals,
  resolveDiscountMinor,
  resolveTaxMinor,
  type PricedQuoteItemInput,
} from "./quote-pricing.util";

const start = new Date("2026-08-01T00:00:00Z");

function item(overrides: Partial<PricedQuoteItemInput> = {}): PricedQuoteItemInput {
  return {
    billingMode: "FLAT",
    quantity: 1,
    discountValue: 0,
    taxRateBp: 0,
    depositMinor: 0,
    ...overrides,
  };
}

describe("resolveDiscountMinor", () => {
  it("returns 0 when no discountType is set", () => {
    expect(resolveDiscountMinor(10_000, null, 500)).toBe(0);
  });

  it("computes a FIXED discount in minor units", () => {
    expect(resolveDiscountMinor(10_000, "FIXED", 1_500)).toBe(1_500);
  });

  it("computes a PERCENTAGE discount from basis points", () => {
    expect(resolveDiscountMinor(10_000, "PERCENTAGE", 1_000)).toBe(1_000); // 10.00%
  });

  it("rounds a PERCENTAGE discount once, never producing fractional minor units", () => {
    expect(resolveDiscountMinor(999, "PERCENTAGE", 3_333)).toBe(Math.round((999 * 3_333) / 10_000));
  });

  it("clamps a FIXED discount to never exceed the base amount", () => {
    expect(resolveDiscountMinor(1_000, "FIXED", 5_000)).toBe(1_000);
  });

  it("clamps a PERCENTAGE discount above 100% to the base amount", () => {
    expect(resolveDiscountMinor(1_000, "PERCENTAGE", 15_000)).toBe(1_000);
  });

  it("never returns a negative discount", () => {
    expect(resolveDiscountMinor(1_000, "FIXED", -500)).toBe(0);
  });
});

describe("resolveTaxMinor", () => {
  it("returns 0 for a zero tax rate", () => {
    expect(resolveTaxMinor(10_000, 0)).toBe(0);
  });

  it("computes tax from basis points with a single rounding step", () => {
    expect(resolveTaxMinor(10_000, 2_000)).toBe(2_000); // 20.00%
  });

  it("rounds fractional minor units instead of truncating or accumulating error", () => {
    expect(resolveTaxMinor(333, 2_000)).toBe(Math.round((333 * 2_000) / 10_000));
  });
});

describe("computeQuoteItemPricing", () => {
  it("computes a FLAT line: unitPrice * quantity, no duration factor", () => {
    const end = new Date("2026-12-01T00:00:00Z"); // huge span — must be ignored
    const result = computeQuoteItemPricing(
      item({ billingMode: "FLAT", unitPriceMinor: 2_500, quantity: 3 }),
      start,
      end,
    );
    expect(result.lineSubtotalMinor).toBe(7_500);
    expect(result.lineTotalMinor).toBe(7_500);
  });

  it("computes a DAILY line across a 3-day span", () => {
    const end = new Date("2026-08-04T00:00:00Z");
    const result = computeQuoteItemPricing(
      item({ billingMode: "DAILY", dailyPriceMinor: 1_000, quantity: 2 }),
      start,
      end,
    );
    expect(result.lineSubtotalMinor).toBe(1_000 * 3 * 2);
  });

  it("computes a WEEKLY line: unitPrice * ceil(days/7) * quantity", () => {
    const end = new Date("2026-08-10T00:00:00Z"); // 9 days -> 2 weeks
    const result = computeQuoteItemPricing(
      item({ billingMode: "WEEKLY", weeklyPriceMinor: 5_000 }),
      start,
      end,
    );
    expect(result.lineSubtotalMinor).toBe(10_000);
  });

  it("computes a MONTHLY line using real calendar months (Jan 31 -> Feb 28)", () => {
    const monthlyStart = new Date("2027-01-31T00:00:00Z");
    const end = new Date("2027-02-28T00:00:00Z");
    const result = computeQuoteItemPricing(
      item({ billingMode: "MONTHLY", monthlyPriceMinor: 15_000 }),
      monthlyStart,
      end,
    );
    expect(result.lineSubtotalMinor).toBe(15_000);
  });

  it("computes a MONTHLY line correctly across a leap-year February (Jan 31 -> Feb 29)", () => {
    const monthlyStart = new Date("2028-01-31T00:00:00Z");
    const end = new Date("2028-02-29T00:00:00Z");
    const result = computeQuoteItemPricing(
      item({ billingMode: "MONTHLY", monthlyPriceMinor: 20_000 }),
      monthlyStart,
      end,
    );
    expect(result.lineSubtotalMinor).toBe(20_000);
  });

  it("computes a MONTHLY line correctly for Aug 31 -> Sep 30", () => {
    const monthlyStart = new Date("2026-08-31T00:00:00Z");
    const end = new Date("2026-09-30T00:00:00Z");
    const result = computeQuoteItemPricing(
      item({ billingMode: "MONTHLY", monthlyPriceMinor: 12_000 }),
      monthlyStart,
      end,
    );
    expect(result.lineSubtotalMinor).toBe(12_000);
  });

  describe("MONTHLY with a tenant-configurable strategy (shared with Rentals)", () => {
    it("CALENDAR_MONTH: splits into complete months plus a daily-priced remainder", () => {
      // Jan 15 -> Mar 20: 2 complete months (Jan15->Mar15) + 5 remaining days
      const monthlyStart = new Date("2026-01-15T00:00:00Z");
      const end = new Date("2026-03-20T00:00:00Z");
      const result = computeQuoteItemPricing(
        item({
          billingMode: "MONTHLY",
          monthlyPriceMinor: 20_000,
          dailyPriceMinor: 1_000,
          monthlyBillingStrategy: "CALENDAR_MONTH",
        }),
        monthlyStart,
        end,
      );
      expect(result.lineSubtotalMinor).toBe(20_000 * 2 + 1_000 * 5);
    });

    it("FIXED_30_DAYS: 65 billable days -> 2 monthly units + 5 daily units", () => {
      const monthlyStart = new Date("2026-01-01T00:00:00Z");
      const end = new Date("2026-03-07T00:00:00Z"); // 65 days
      const result = computeQuoteItemPricing(
        item({
          billingMode: "MONTHLY",
          monthlyPriceMinor: 30_000,
          dailyPriceMinor: 900,
          monthlyBillingStrategy: "FIXED_30_DAYS",
        }),
        monthlyStart,
        end,
      );
      expect(result.lineSubtotalMinor).toBe(30_000 * 2 + 900 * 5);
    });

    it("CUSTOM with 28 days: 60 billable days -> 2 custom units + 4 daily units", () => {
      const monthlyStart = new Date("2026-01-01T00:00:00Z");
      const end = new Date("2026-03-02T00:00:00Z"); // 60 days
      const result = computeQuoteItemPricing(
        item({
          billingMode: "MONTHLY",
          monthlyPriceMinor: 28_000,
          dailyPriceMinor: 800,
          monthlyBillingStrategy: "CUSTOM",
          customMonthLengthDays: 28,
        }),
        monthlyStart,
        end,
      );
      expect(result.lineSubtotalMinor).toBe(28_000 * 2 + 800 * 4);
    });

    it("applies quantity to both the monthly and daily portions", () => {
      const monthlyStart = new Date("2026-01-15T00:00:00Z");
      const end = new Date("2026-03-20T00:00:00Z");
      const result = computeQuoteItemPricing(
        item({
          billingMode: "MONTHLY",
          monthlyPriceMinor: 20_000,
          dailyPriceMinor: 1_000,
          monthlyBillingStrategy: "CALENDAR_MONTH",
          quantity: 2,
        }),
        monthlyStart,
        end,
      );
      expect(result.lineSubtotalMinor).toBe((20_000 * 2 + 1_000 * 5) * 2);
    });

    it("throws when a strategy-priced MONTHLY item is missing dailyPriceMinor", () => {
      const end = new Date("2026-03-20T00:00:00Z");
      expect(() =>
        computeQuoteItemPricing(
          item({
            billingMode: "MONTHLY",
            monthlyPriceMinor: 20_000,
            monthlyBillingStrategy: "CALENDAR_MONTH",
          }),
          new Date("2026-01-15T00:00:00Z"),
          end,
        ),
      ).toThrow(BadRequestException);
    });

    it("does not require dailyPriceMinor for a legacy item with no strategy (backward compatible)", () => {
      // Same 3 legacy tests above already cover this; this asserts the
      // absence of dailyPriceMinor specifically does not throw.
      const monthlyStart = new Date("2027-01-31T00:00:00Z");
      const end = new Date("2027-02-28T00:00:00Z");
      expect(() =>
        computeQuoteItemPricing(
          item({ billingMode: "MONTHLY", monthlyPriceMinor: 15_000 }),
          monthlyStart,
          end,
        ),
      ).not.toThrow();
    });

    it("a legacy (null-strategy) item reproduces the original whole-month-rounding total, not the new split", () => {
      // Jan 15 -> Mar 20 under the OLD whole-month rounding rule rounds the
      // partial month up to a full extra month (3 months), unlike the new
      // engine's 2 months + 5 days split above.
      const monthlyStart = new Date("2026-01-15T00:00:00Z");
      const end = new Date("2026-03-20T00:00:00Z");
      const result = computeQuoteItemPricing(
        item({ billingMode: "MONTHLY", monthlyPriceMinor: 20_000 }),
        monthlyStart,
        end,
      );
      expect(result.lineSubtotalMinor).toBe(20_000 * 3);
    });

    it("ROUND_UP_TO_FULL_MONTH: any started remaining period rounds up to one more full month, never requiring dailyPriceMinor", () => {
      // Jan 15 -> Mar 20: 2 complete months + a started remainder -> 3 full months
      const monthlyStart = new Date("2026-01-15T00:00:00Z");
      const end = new Date("2026-03-20T00:00:00Z");
      const result = computeQuoteItemPricing(
        item({
          billingMode: "MONTHLY",
          monthlyPriceMinor: 20_000,
          monthlyBillingStrategy: "CALENDAR_MONTH",
          partialMonthPolicy: "ROUND_UP_TO_FULL_MONTH",
        }),
        monthlyStart,
        end,
      );
      expect(result.lineSubtotalMinor).toBe(20_000 * 3);
    });

    it("ROUND_UP_TO_FULL_MONTH with no remainder charges exactly the complete months", () => {
      const monthlyStart = new Date("2026-08-18T00:00:00Z");
      const end = new Date("2026-09-18T00:00:00Z"); // exactly 1 calendar month
      const result = computeQuoteItemPricing(
        item({
          billingMode: "MONTHLY",
          monthlyPriceMinor: 60_000,
          monthlyBillingStrategy: "CALENDAR_MONTH",
          partialMonthPolicy: "ROUND_UP_TO_FULL_MONTH",
        }),
        monthlyStart,
        end,
      );
      expect(result.lineSubtotalMinor).toBe(60_000);
    });

    it("throws for a missing partialMonthPolicy default (PRORATE_BY_DAY) but not for an explicit ROUND_UP_TO_FULL_MONTH, same inputs", () => {
      const monthlyStart = new Date("2026-08-18T00:00:00Z");
      const end = new Date("2026-09-19T00:00:00Z"); // 1 month + 1 day
      const withoutDaily = () =>
        computeQuoteItemPricing(
          item({
            billingMode: "MONTHLY",
            monthlyPriceMinor: 60_000,
            monthlyBillingStrategy: "CALENDAR_MONTH",
          }),
          monthlyStart,
          end,
        );
      expect(withoutDaily).toThrow(BadRequestException);

      const roundedUp = computeQuoteItemPricing(
        item({
          billingMode: "MONTHLY",
          monthlyPriceMinor: 60_000,
          monthlyBillingStrategy: "CALENDAR_MONTH",
          partialMonthPolicy: "ROUND_UP_TO_FULL_MONTH",
        }),
        monthlyStart,
        end,
      );
      expect(roundedUp.lineSubtotalMinor).toBe(60_000 * 2);
    });

    describe("regression matrix (600 PLN/month, 18 Aug start)", () => {
      const monthlyStart = new Date("2026-08-18T00:00:00Z");
      const monthlyPriceMinor = 60_000;
      const dailyPriceMinor = 2_000;

      function monthlyItem(partialMonthPolicy: PartialMonthPolicy): PricedQuoteItemInput {
        return item({
          billingMode: "MONTHLY",
          monthlyPriceMinor,
          dailyPriceMinor,
          monthlyBillingStrategy: "CALENDAR_MONTH",
          partialMonthPolicy,
        });
      }

      it("exactly 1 month: both policies charge exactly one full month", () => {
        const end = new Date("2026-09-18T00:00:00Z");
        expect(
          computeQuoteItemPricing(monthlyItem("PRORATE_BY_DAY"), monthlyStart, end)
            .lineSubtotalMinor,
        ).toBe(monthlyPriceMinor);
        expect(
          computeQuoteItemPricing(monthlyItem("ROUND_UP_TO_FULL_MONTH"), monthlyStart, end)
            .lineSubtotalMinor,
        ).toBe(monthlyPriceMinor);
      });

      it("1 month + 1 day", () => {
        const end = new Date("2026-09-19T00:00:00Z");
        expect(
          computeQuoteItemPricing(monthlyItem("PRORATE_BY_DAY"), monthlyStart, end)
            .lineSubtotalMinor,
        ).toBe(monthlyPriceMinor + dailyPriceMinor * 1);
        expect(
          computeQuoteItemPricing(monthlyItem("ROUND_UP_TO_FULL_MONTH"), monthlyStart, end)
            .lineSubtotalMinor,
        ).toBe(monthlyPriceMinor * 2);
      });

      it("1 month + 11 days", () => {
        const end = new Date("2026-09-29T00:00:00Z");
        expect(
          computeQuoteItemPricing(monthlyItem("PRORATE_BY_DAY"), monthlyStart, end)
            .lineSubtotalMinor,
        ).toBe(monthlyPriceMinor + dailyPriceMinor * 11);
        expect(
          computeQuoteItemPricing(monthlyItem("ROUND_UP_TO_FULL_MONTH"), monthlyStart, end)
            .lineSubtotalMinor,
        ).toBe(monthlyPriceMinor * 2);
      });

      it("almost 2 months (one day short)", () => {
        const end = new Date("2026-10-17T00:00:00Z");
        // 1 complete month (Aug18->Sep18) + 29 remaining days (Sep18->Oct17, September has 30 days)
        expect(
          computeQuoteItemPricing(monthlyItem("PRORATE_BY_DAY"), monthlyStart, end)
            .lineSubtotalMinor,
        ).toBe(monthlyPriceMinor + dailyPriceMinor * 29);
        expect(
          computeQuoteItemPricing(monthlyItem("ROUND_UP_TO_FULL_MONTH"), monthlyStart, end)
            .lineSubtotalMinor,
        ).toBe(monthlyPriceMinor * 2);
      });

      it("exactly 2 months: both policies charge exactly two full months", () => {
        const end = new Date("2026-10-18T00:00:00Z");
        expect(
          computeQuoteItemPricing(monthlyItem("PRORATE_BY_DAY"), monthlyStart, end)
            .lineSubtotalMinor,
        ).toBe(monthlyPriceMinor * 2);
        expect(
          computeQuoteItemPricing(monthlyItem("ROUND_UP_TO_FULL_MONTH"), monthlyStart, end)
            .lineSubtotalMinor,
        ).toBe(monthlyPriceMinor * 2);
      });
    });
  });

  it("computes a CUSTOM line as a flat price, ignoring duration and quantity", () => {
    const end = new Date("2026-12-01T00:00:00Z");
    const result = computeQuoteItemPricing(
      item({ billingMode: "CUSTOM", customPriceMinor: 99_999, quantity: 5 }),
      start,
      end,
    );
    expect(result.lineSubtotalMinor).toBe(99_999);
  });

  it("applies the item's own percentage discount before tax", () => {
    const end = new Date("2026-08-02T00:00:00Z");
    const result = computeQuoteItemPricing(
      item({
        billingMode: "FLAT",
        unitPriceMinor: 10_000,
        discountType: "PERCENTAGE",
        discountValue: 1_000, // 10%
      }),
      start,
      end,
    );
    expect(result.lineSubtotalMinor).toBe(10_000);
    expect(result.discountTotalMinor).toBe(1_000);
    expect(result.lineTotalMinor).toBe(9_000);
  });

  it("computes tax on the post-discount amount, not the gross subtotal", () => {
    const end = new Date("2026-08-02T00:00:00Z");
    const result = computeQuoteItemPricing(
      item({
        billingMode: "FLAT",
        unitPriceMinor: 10_000,
        discountType: "FIXED",
        discountValue: 2_000,
        taxRateBp: 2_000, // 20%
      }),
      start,
      end,
    );
    // (10000 - 2000) * 20% = 1600, never 10000 * 20% = 2000
    expect(result.taxTotalMinor).toBe(1_600);
    expect(result.lineTotalMinor).toBe(8_000 + 1_600);
  });

  it("floors the line total at 0", () => {
    const end = new Date("2026-08-02T00:00:00Z");
    const result = computeQuoteItemPricing(
      item({
        billingMode: "FLAT",
        unitPriceMinor: 100,
        discountType: "FIXED",
        discountValue: 10_000,
      }),
      start,
      end,
    );
    expect(result.discountTotalMinor).toBe(100);
    expect(result.lineTotalMinor).toBe(0);
  });

  it("throws when the price field matching billingMode is missing", () => {
    const end = new Date("2026-08-02T00:00:00Z");
    expect(() => computeQuoteItemPricing(item({ billingMode: "DAILY" }), start, end)).toThrow(
      BadRequestException,
    );
  });

  it("throws when a FLAT item is missing unitPriceMinor", () => {
    const end = new Date("2026-08-02T00:00:00Z");
    expect(() => computeQuoteItemPricing(item({ billingMode: "FLAT" }), start, end)).toThrow(
      BadRequestException,
    );
  });
});

describe("computeQuoteTotals", () => {
  it("sums item line totals into subtotal, then applies the quote-level discount", () => {
    const end = new Date("2026-08-04T00:00:00Z"); // 3 days
    const items: PricedQuoteItemInput[] = [
      item({ billingMode: "DAILY", dailyPriceMinor: 1_000 }),
      item({ billingMode: "FLAT", unitPriceMinor: 500, quantity: 2 }),
    ];
    // subtotal = (1000*3) + (500*2) = 4000
    const result = computeQuoteTotals(items, start, end, "FIXED", 500);
    expect(result.subtotalMinor).toBe(4_000);
    expect(result.discountTotalMinor).toBe(500);
    expect(result.totalMinor).toBe(3_500);
  });

  it("aggregates per-line tax into taxTotalMinor without double-counting it in totalMinor", () => {
    const end = new Date("2026-08-02T00:00:00Z");
    const items: PricedQuoteItemInput[] = [
      item({ billingMode: "FLAT", unitPriceMinor: 10_000, taxRateBp: 2_000 }), // +2000 tax -> line total 12000
    ];
    const result = computeQuoteTotals(items, start, end, null, 0);
    expect(result.taxTotalMinor).toBe(2_000);
    expect(result.subtotalMinor).toBe(12_000); // tax already folded into the line total
    expect(result.totalMinor).toBe(12_000); // not 14000 — tax isn't added a second time
  });

  it("sums per-line deposits into depositTotalMinor, excluded from totalMinor", () => {
    const end = new Date("2026-08-02T00:00:00Z");
    const items: PricedQuoteItemInput[] = [
      item({ billingMode: "FLAT", unitPriceMinor: 1_000, depositMinor: 300 }),
      item({ billingMode: "FLAT", unitPriceMinor: 1_000, depositMinor: 700 }),
    ];
    const result = computeQuoteTotals(items, start, end, null, 0);
    expect(result.depositTotalMinor).toBe(1_000);
    expect(result.totalMinor).toBe(2_000); // deposits never added into the total
  });

  it("floors the grand total at 0", () => {
    const end = new Date("2026-08-02T00:00:00Z");
    const items: PricedQuoteItemInput[] = [item({ billingMode: "FLAT", unitPriceMinor: 100 })];
    const result = computeQuoteTotals(items, start, end, "FIXED", 10_000);
    expect(result.totalMinor).toBe(0);
  });

  it("returns a 0 subtotal for an empty item list", () => {
    const end = new Date("2026-08-02T00:00:00Z");
    const result = computeQuoteTotals([], start, end, null, 0);
    expect(result.subtotalMinor).toBe(0);
    expect(result.totalMinor).toBe(0);
    expect(result.items).toEqual([]);
  });

  it("returns per-item pricing results aligned by index with the input items", () => {
    const end = new Date("2026-08-04T00:00:00Z");
    const items: PricedQuoteItemInput[] = [
      item({ billingMode: "DAILY", dailyPriceMinor: 1_000 }),
      item({ billingMode: "FLAT", unitPriceMinor: 250 }),
    ];
    const result = computeQuoteTotals(items, start, end, null, 0);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.lineSubtotalMinor).toBe(3_000);
    expect(result.items[1]?.lineSubtotalMinor).toBe(250);
  });

  describe("additional billable line items (e.g. Delivery) participate in the commercial total", () => {
    it("a Delivery FLAT item (quantity x price) is fully included in subtotal and total, alongside a MONTHLY rental item", () => {
      // Real example from manual testing: Rental = 600 PLN/month (exactly 1
      // month, no remainder), Delivery = 700 PLN x 2.
      const monthlyStart = new Date("2026-08-18T00:00:00Z");
      const end = new Date("2026-09-18T00:00:00Z");
      const items: PricedQuoteItemInput[] = [
        item({
          billingMode: "MONTHLY",
          monthlyPriceMinor: 60_000,
          monthlyBillingStrategy: "CALENDAR_MONTH",
          partialMonthPolicy: "ROUND_UP_TO_FULL_MONTH",
        }),
        item({ billingMode: "FLAT", unitPriceMinor: 70_000, quantity: 2 }),
      ];
      const result = computeQuoteTotals(items, monthlyStart, end, null, 0);
      expect(result.items[1]?.lineSubtotalMinor).toBe(70_000 * 2);
      expect(result.subtotalMinor).toBe(60_000 + 70_000 * 2);
      expect(result.totalMinor).toBe(60_000 + 70_000 * 2);
    });

    it("a Delivery item's own discount and tax are reflected in the aggregate totals", () => {
      const end = new Date("2026-08-02T00:00:00Z");
      const items: PricedQuoteItemInput[] = [
        item({
          billingMode: "FLAT",
          unitPriceMinor: 70_000,
          quantity: 2,
          discountType: "FIXED",
          discountValue: 10_000,
          taxRateBp: 2_000,
        }),
      ];
      const result = computeQuoteTotals(items, start, end, null, 0);
      // subtotal(gross)=140000, -10000 discount=130000, +20% tax=26000 -> line total 156000
      expect(result.items[0]?.lineTotalMinor).toBe(156_000);
      expect(result.taxTotalMinor).toBe(26_000);
      expect(result.subtotalMinor).toBe(156_000);
      expect(result.totalMinor).toBe(156_000);
    });
  });
});
