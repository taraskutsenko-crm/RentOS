import { describe, expect, it } from "vitest";

import { getRentalTimeIntelligence } from "../../src/lib/rental-time-intelligence";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight for a given date, so day-boundary math is independent of the runner's timezone. */
function localMidnight(isoDate: string): number {
  const parts = isoDate.split("-").map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return new Date(year, month - 1, day).getTime();
}

describe("getRentalTimeIntelligence", () => {
  const now = localMidnight("2026-08-10");
  const plannedStart = new Date(localMidnight("2026-08-10")).toISOString();

  it("returns cancelled for a CANCELLED rental regardless of dates", () => {
    const result = getRentalTimeIntelligence("CANCELLED", plannedStart, plannedStart, now);
    expect(result).toEqual({ kind: "cancelled", days: 0 });
  });

  it("returns completed for a RETURNED rental", () => {
    const result = getRentalTimeIntelligence("RETURNED", plannedStart, plannedStart, now);
    expect(result).toEqual({ kind: "completed", days: 0 });
  });

  it("returns completed for a COMPLETED rental", () => {
    const result = getRentalTimeIntelligence("COMPLETED", plannedStart, plannedStart, now);
    expect(result).toEqual({ kind: "completed", days: 0 });
  });

  it("returns starts_today for a not-yet-started rental whose start is today", () => {
    const start = new Date(localMidnight("2026-08-10")).toISOString();
    const end = new Date(localMidnight("2026-08-15")).toISOString();
    const result = getRentalTimeIntelligence("RESERVED", start, end, now);
    expect(result).toEqual({ kind: "starts_today", days: 0 });
  });

  it("returns starts_tomorrow for a not-yet-started rental whose start is tomorrow", () => {
    const start = new Date(localMidnight("2026-08-11")).toISOString();
    const end = new Date(localMidnight("2026-08-15")).toISOString();
    const result = getRentalTimeIntelligence("DRAFT", start, end, now);
    expect(result).toEqual({ kind: "starts_tomorrow", days: 1 });
  });

  it("returns starts_in_days for a start further than tomorrow", () => {
    const start = new Date(localMidnight("2026-08-15")).toISOString();
    const end = new Date(localMidnight("2026-08-20")).toISOString();
    const result = getRentalTimeIntelligence("QUOTE", start, end, now);
    expect(result).toEqual({ kind: "starts_in_days", days: 5 });
  });

  it("returns days_remaining for an ACTIVE rental with time left before plannedEnd", () => {
    const start = new Date(localMidnight("2026-08-05")).toISOString();
    const end = new Date(localMidnight("2026-08-13")).toISOString();
    const result = getRentalTimeIntelligence("ACTIVE", start, end, now);
    expect(result).toEqual({ kind: "days_remaining", days: 3 });
  });

  it("returns due_today for an ACTIVE rental whose plannedEnd is today", () => {
    const start = new Date(localMidnight("2026-08-05")).toISOString();
    const end = new Date(localMidnight("2026-08-10")).toISOString();
    const result = getRentalTimeIntelligence("ACTIVE", start, end, now);
    expect(result).toEqual({ kind: "due_today", days: 0 });
  });

  it("returns overdue for an ACTIVE rental past its plannedEnd", () => {
    const start = new Date(localMidnight("2026-08-01")).toISOString();
    const end = new Date(localMidnight("2026-08-07")).toISOString();
    const result = getRentalTimeIntelligence("ACTIVE", start, end, now);
    expect(result).toEqual({ kind: "overdue", days: 3 });
  });

  it("falls back to end-relative status when a RESERVED rental's start has already passed", () => {
    const start = new Date(localMidnight("2026-08-08")).toISOString();
    const end = new Date(localMidnight("2026-08-09")).toISOString();
    const result = getRentalTimeIntelligence("RESERVED", start, end, now);
    expect(result).toEqual({ kind: "overdue", days: 1 });
  });

  it("is a pure function — the same inputs always produce the same output", () => {
    const start = new Date(now).toISOString();
    const end = new Date(now + 5 * DAY_MS).toISOString();
    const first = getRentalTimeIntelligence("DRAFT", start, end, now);
    const second = getRentalTimeIntelligence("DRAFT", start, end, now);
    expect(first).toEqual(second);
  });
});
