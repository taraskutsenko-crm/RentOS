import { describe, expect, it } from "vitest";

import { getQuoteValidityIntelligence } from "../../src/lib/quote-validity-intelligence";

/** Local midnight for a given date, so day-boundary math is independent of the runner's timezone. */
function localMidnight(isoDate: string): number {
  const parts = isoDate.split("-").map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return new Date(year, month - 1, day).getTime();
}

describe("getQuoteValidityIntelligence", () => {
  const now = localMidnight("2026-08-10");

  it("returns accepted for an ACCEPTED quote regardless of validUntil", () => {
    const validUntil = new Date(localMidnight("2026-07-01")).toISOString();
    expect(getQuoteValidityIntelligence("ACCEPTED", validUntil, now)).toEqual({
      kind: "accepted",
      days: 0,
    });
  });

  it("returns rejected for a REJECTED quote", () => {
    const validUntil = new Date(localMidnight("2026-08-15")).toISOString();
    expect(getQuoteValidityIntelligence("REJECTED", validUntil, now)).toEqual({
      kind: "rejected",
      days: 0,
    });
  });

  it("returns converted for a CONVERTED quote", () => {
    const validUntil = new Date(localMidnight("2026-08-15")).toISOString();
    expect(getQuoteValidityIntelligence("CONVERTED", validUntil, now)).toEqual({
      kind: "converted",
      days: 0,
    });
  });

  it("returns cancelled for a CANCELLED quote", () => {
    const validUntil = new Date(localMidnight("2026-08-15")).toISOString();
    expect(getQuoteValidityIntelligence("CANCELLED", validUntil, now)).toEqual({
      kind: "cancelled",
      days: 0,
    });
  });

  it("returns expired for an EXPIRED quote", () => {
    const validUntil = new Date(localMidnight("2026-08-01")).toISOString();
    expect(getQuoteValidityIntelligence("EXPIRED", validUntil, now)).toEqual({
      kind: "expired",
      days: 0,
    });
  });

  it("returns expires_today for a DRAFT quote whose validUntil is today", () => {
    const validUntil = new Date(localMidnight("2026-08-10")).toISOString();
    expect(getQuoteValidityIntelligence("DRAFT", validUntil, now)).toEqual({
      kind: "expires_today",
      days: 0,
    });
  });

  it("returns expires_tomorrow for a SENT quote whose validUntil is tomorrow", () => {
    const validUntil = new Date(localMidnight("2026-08-11")).toISOString();
    expect(getQuoteValidityIntelligence("SENT", validUntil, now)).toEqual({
      kind: "expires_tomorrow",
      days: 1,
    });
  });

  it("returns expires_in_days for a VIEWED quote with validUntil further out", () => {
    const validUntil = new Date(localMidnight("2026-08-17")).toISOString();
    expect(getQuoteValidityIntelligence("VIEWED", validUntil, now)).toEqual({
      kind: "expires_in_days",
      days: 7,
    });
  });

  it("falls back to expired when validUntil has already passed but the status hasn't flipped yet", () => {
    const validUntil = new Date(localMidnight("2026-08-05")).toISOString();
    expect(getQuoteValidityIntelligence("SENT", validUntil, now)).toEqual({
      kind: "expired",
      days: 5,
    });
  });

  it("is a pure function — the same inputs always produce the same output", () => {
    const validUntil = new Date(now).toISOString();
    const first = getQuoteValidityIntelligence("DRAFT", validUntil, now);
    const second = getQuoteValidityIntelligence("DRAFT", validUntil, now);
    expect(first).toEqual(second);
  });
});
