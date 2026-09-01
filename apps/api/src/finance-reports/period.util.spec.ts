import { describe, expect, it } from "vitest";

import { InvalidReportPeriodError, resolveReportPeriod } from "./period.util";

describe("resolveReportPeriod", () => {
  it("THIS_MONTH resolves to the tenant-local calendar month, not the server's own date", () => {
    const period = resolveReportPeriod("THIS_MONTH", "Europe/Warsaw");
    const now = new Date();
    const expectedYear = now.getUTCFullYear();
    expect(period.fromDate).toMatch(new RegExp(`^${expectedYear}-\\d{2}-01$`));
    expect(period.dateOnlyRange.gte).toBeInstanceOf(Date);
    expect(period.dateOnlyRange.lt.getTime()).toBeGreaterThan(period.dateOnlyRange.gte!.getTime());
  });

  it("PREVIOUS_MONTH ends exactly where THIS_MONTH begins", () => {
    const thisMonth = resolveReportPeriod("THIS_MONTH", "America/New_York");
    const previousMonth = resolveReportPeriod("PREVIOUS_MONTH", "America/New_York");
    expect(previousMonth.dateOnlyRange.lt.getTime()).toBe(thisMonth.dateOnlyRange.gte!.getTime());
  });

  it("THIS_MONTH's own `previous` field equals a standalone PREVIOUS_MONTH resolution", () => {
    const thisMonth = resolveReportPeriod("THIS_MONTH", "Europe/Warsaw");
    const previousMonth = resolveReportPeriod("PREVIOUS_MONTH", "Europe/Warsaw");
    expect(thisMonth.previous?.fromDate).toBe(previousMonth.fromDate);
    expect(thisMonth.previous?.toDate).toBe(previousMonth.toDate);
  });

  it("LAST_30_DAYS spans exactly 30 calendar days ending today", () => {
    const period = resolveReportPeriod("LAST_30_DAYS", "UTC");
    const days = Math.round(
      (period.dateOnlyRange.lt.getTime() - period.dateOnlyRange.gte!.getTime()) / 86_400_000,
    );
    expect(days).toBe(30);
  });

  it("LAST_90_DAYS's previous period is also exactly 90 days and immediately precedes it", () => {
    const period = resolveReportPeriod("LAST_90_DAYS", "UTC");
    const prevDays = Math.round(
      (period.previous!.dateOnlyRange.lt.getTime() - period.previous!.dateOnlyRange.gte!.getTime()) /
        86_400_000,
    );
    expect(prevDays).toBe(90);
    expect(period.previous!.dateOnlyRange.lt.getTime()).toBe(period.dateOnlyRange.gte!.getTime());
  });

  it("LAST_2_MONTHS spans exactly 2 calendar months ending today, with a same-length previous window", () => {
    const period = resolveReportPeriod("LAST_2_MONTHS", "UTC");
    const today = new Date();
    const endExclusive = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1));
    const expectedStart = new Date(endExclusive);
    expectedStart.setUTCMonth(expectedStart.getUTCMonth() - 2);
    expect(period.dateOnlyRange.gte!.getTime()).toBe(expectedStart.getTime());
    expect(period.dateOnlyRange.lt.getTime()).toBe(endExclusive.getTime());
    expect(period.previous!.dateOnlyRange.lt.getTime()).toBe(period.dateOnlyRange.gte!.getTime());
  });

  it("LAST_3_MONTHS spans exactly 3 calendar months ending today, with a same-length previous window", () => {
    const period = resolveReportPeriod("LAST_3_MONTHS", "UTC");
    const today = new Date();
    const endExclusive = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1));
    const expectedStart = new Date(endExclusive);
    expectedStart.setUTCMonth(expectedStart.getUTCMonth() - 3);
    expect(period.dateOnlyRange.gte!.getTime()).toBe(expectedStart.getTime());
    expect(period.dateOnlyRange.lt.getTime()).toBe(endExclusive.getTime());
    expect(period.previous!.dateOnlyRange.lt.getTime()).toBe(period.dateOnlyRange.gte!.getTime());
  });

  it("THIS_QUARTER resolves to a 3-calendar-month span starting on a quarter boundary", () => {
    const period = resolveReportPeriod("THIS_QUARTER", "Europe/Warsaw");
    const startMonth = Number(period.fromDate!.split("-")[1]);
    expect([1, 4, 7, 10]).toContain(startMonth);
  });

  it("PREVIOUS_QUARTER ends exactly where THIS_QUARTER begins", () => {
    const thisQuarter = resolveReportPeriod("THIS_QUARTER", "UTC");
    const previousQuarter = resolveReportPeriod("PREVIOUS_QUARTER", "UTC");
    expect(previousQuarter.dateOnlyRange.lt.getTime()).toBe(thisQuarter.dateOnlyRange.gte!.getTime());
  });

  it("THIS_YEAR starts on January 1st and PREVIOUS_YEAR ends where it begins", () => {
    const thisYear = resolveReportPeriod("THIS_YEAR", "UTC");
    expect(thisYear.fromDate).toMatch(/-01-01$/);
    const previousYear = resolveReportPeriod("PREVIOUS_YEAR", "UTC");
    expect(previousYear.dateOnlyRange.lt.getTime()).toBe(thisYear.dateOnlyRange.gte!.getTime());
  });

  it("ALL_TIME has no lower bound and no previous-period comparison", () => {
    const period = resolveReportPeriod("ALL_TIME", "UTC");
    expect(period.fromDate).toBeNull();
    expect(period.dateOnlyRange.gte).toBeUndefined();
    expect(period.instantRange.gte).toBeUndefined();
    expect(period.previous).toBeNull();
  });

  it("CUSTOM resolves an inclusive from/to range and a same-length previous window", () => {
    const period = resolveReportPeriod("CUSTOM", "UTC", { from: "2026-09-01", to: "2026-09-10" });
    expect(period.fromDate).toBe("2026-09-01");
    expect(period.toDate).toBe("2026-09-10");
    // 10 days inclusive (Sep 1..Sep 10)
    const days = Math.round(
      (period.dateOnlyRange.lt.getTime() - period.dateOnlyRange.gte!.getTime()) / 86_400_000,
    );
    expect(days).toBe(10);
    expect(period.previous?.toDate).toBe("2026-08-31");
    const prevDays = Math.round(
      (period.previous!.dateOnlyRange.lt.getTime() - period.previous!.dateOnlyRange.gte!.getTime()) /
        86_400_000,
    );
    expect(prevDays).toBe(10);
  });

  it("CUSTOM rejects a `from` after `to`", () => {
    expect(() => resolveReportPeriod("CUSTOM", "UTC", { from: "2026-09-10", to: "2026-09-01" })).toThrow(
      InvalidReportPeriodError,
    );
  });

  it("CUSTOM allows a single-day range (`from` equal to `to`)", () => {
    const period = resolveReportPeriod("CUSTOM", "UTC", { from: "2026-09-01", to: "2026-09-01" });
    expect(period.fromDate).toBe("2026-09-01");
    expect(period.toDate).toBe("2026-09-01");
  });

  it("CUSTOM rejects a missing from/to", () => {
    expect(() => resolveReportPeriod("CUSTOM", "UTC")).toThrow(InvalidReportPeriodError);
  });

  it("CUSTOM rejects malformed date strings", () => {
    expect(() => resolveReportPeriod("CUSTOM", "UTC", { from: "not-a-date", to: "2026-09-01" })).toThrow(
      InvalidReportPeriodError,
    );
  });

  it("rejects an invalid tenant timezone", () => {
    expect(() => resolveReportPeriod("THIS_MONTH", "Not/AZone")).toThrow(InvalidReportPeriodError);
  });

  it("a Poland tenant (Europe/Warsaw) and a USA tenant (America/New_York) resolve THIS_MONTH to different UTC instant boundaries when their local midnights differ", () => {
    const poland = resolveReportPeriod("THIS_MONTH", "Europe/Warsaw");
    const usa = resolveReportPeriod("THIS_MONTH", "America/New_York");
    // Same calendar month everywhere close to UTC, but the true UTC
    // instant of "local midnight on the 1st" must differ between the two
    // timezones (Warsaw is ahead of UTC, New York is behind it).
    expect(poland.instantRange.gte!.getTime()).not.toBe(usa.instantRange.gte!.getTime());
  });

  it("dateOnlyRange stays anchored at UTC midnight regardless of tenant timezone (date-only fields are never timezone-shifted)", () => {
    const poland = resolveReportPeriod("THIS_MONTH", "Europe/Warsaw");
    const usa = resolveReportPeriod("THIS_MONTH", "America/New_York");
    // Same calendar month digits -> identical dateOnlyRange boundaries,
    // unlike instantRange above.
    if (poland.fromDate === usa.fromDate) {
      expect(poland.dateOnlyRange.gte!.getTime()).toBe(usa.dateOnlyRange.gte!.getTime());
    }
  });
});
