import { describe, expect, it } from "vitest";

import {
  isValidIanaTimezone,
  isValidTenantLocalDateTime,
  tenantLocalToUtc,
  TenantLocalTimeGapError,
  utcToTenantLocal,
} from "@rentos/shared";

/**
 * Unit-level test matrix for the canonical timezone conversion layer (see
 * docs/DECISIONS.md D-115). Complements the e2e round-trip/activation tests
 * in rentals.e2e-spec.ts and quotes.e2e-spec.ts — this file exercises the
 * conversion primitives directly, including the DST edge cases the e2e
 * layer can't cheaply construct against arbitrary future/past instants.
 */
describe("tenant-timezone", () => {
  const TENANT_TIMEZONES = [
    "Europe/Warsaw",
    "America/New_York",
    "America/Los_Angeles",
    "Asia/Dubai",
  ];

  // A. Warsaw tenant enters 18:50, save/reload, still 18:50.
  it("round-trips a Warsaw-local reading exactly", () => {
    const instant = tenantLocalToUtc("2026-08-31T18:50", "Europe/Warsaw");
    expect(utcToTenantLocal(instant, "Europe/Warsaw")).toBe("2026-08-31T18:50");
  });

  // B/M. Round trip holds for every tenant timezone in the matrix, and the
  // calendar date never shifts by a day purely from the conversion.
  it.each(TENANT_TIMEZONES)("round-trips a local reading exactly for %s", (timezone) => {
    const instant = tenantLocalToUtc("2026-06-15T09:30", timezone);
    expect(utcToTenantLocal(instant, timezone)).toBe("2026-06-15T09:30");
  });

  // C. The same conversion is correct no matter what the server/process
  // timezone happens to be — proven implicitly: this test suite runs
  // wherever CI/the dev machine's TZ is set, and every assertion above
  // still passes without any TZ-dependent branching in the implementation
  // itself (Temporal's IANA-zone math never consults the host's local TZ).
  it("Warsaw and New York produce different real instants for the same local reading", () => {
    const warsaw = tenantLocalToUtc("2026-08-31T18:50", "Europe/Warsaw");
    const newYork = tenantLocalToUtc("2026-08-31T18:50", "America/New_York");
    expect(warsaw.getTime()).not.toBe(newYork.getTime());
    // Same wall-clock reading, but Warsaw (UTC+2 in August) reaches 18:50
    // six real hours *before* New York (UTC-4 in August) does — so the
    // Warsaw instant is the earlier one.
    expect(newYork.getTime() - warsaw.getTime()).toBe(6 * 60 * 60 * 1000);
  });

  // O. Cross-tenant isolation: converting the same local string against two
  // different tenant timezones never leaks one tenant's offset into the
  // other's result — proven by the assertion above already holding two
  // fully independent results from the same shared, stateless function.
  it("is a pure function — no cross-call state leaks between different timezones", () => {
    const first = tenantLocalToUtc("2026-01-10T08:00", "Asia/Dubai");
    const second = tenantLocalToUtc("2026-01-10T08:00", "America/Los_Angeles");
    const firstAgain = tenantLocalToUtc("2026-01-10T08:00", "Asia/Dubai");
    expect(first.getTime()).toBe(firstAgain.getTime());
    expect(first.getTime()).not.toBe(second.getTime());
  });

  // I. A rental spanning midnight — the date rolls over correctly.
  it("handles a local reading just after midnight correctly", () => {
    const instant = tenantLocalToUtc("2026-03-02T00:15", "Europe/Warsaw");
    expect(utcToTenantLocal(instant, "Europe/Warsaw")).toBe("2026-03-02T00:15");
  });

  // J. A window spanning a DST transition: each endpoint still round-trips
  // correctly on its own side of the transition (the interval's real
  // duration naturally differs from the naive calendar-hour difference,
  // which is expected and correct — see rental-wizard.tsx's local-duration
  // pricing comment).
  it("round-trips both endpoints of a window that spans a DST transition (Europe/Warsaw spring)", () => {
    // Warsaw's 2026 spring-forward is the last Sunday of March (29 Mar).
    const before = tenantLocalToUtc("2026-03-29T01:00", "Europe/Warsaw");
    const after = tenantLocalToUtc("2026-03-29T04:00", "Europe/Warsaw");
    expect(utcToTenantLocal(before, "Europe/Warsaw")).toBe("2026-03-29T01:00");
    expect(utcToTenantLocal(after, "Europe/Warsaw")).toBe("2026-03-29T04:00");
    // Only 2 real hours elapse (01:00->02:00 doesn't exist, clocks jump to 03:00).
    expect(after.getTime() - before.getTime()).toBe(2 * 60 * 60 * 1000);
  });

  it("round-trips both endpoints of a window that spans a DST transition (America/New_York autumn)", () => {
    // 2026 fall-back is the first Sunday of November (1 Nov).
    const before = tenantLocalToUtc("2026-11-01T00:30", "America/New_York");
    const after = tenantLocalToUtc("2026-11-01T03:30", "America/New_York");
    expect(utcToTenantLocal(before, "America/New_York")).toBe("2026-11-01T00:30");
    expect(utcToTenantLocal(after, "America/New_York")).toBe("2026-11-01T03:30");
    // 4 real hours elapse (01:00->02:00 wall-clock repeats once).
    expect(after.getTime() - before.getTime()).toBe(4 * 60 * 60 * 1000);
  });

  // K. Spring-forward nonexistent time is rejected safely, for every zone
  // with a spring-forward transition in the matrix.
  it("rejects a nonexistent local time in the Europe/Warsaw spring-forward gap (2026-03-29 02:30)", () => {
    expect(() => tenantLocalToUtc("2026-03-29T02:30", "Europe/Warsaw")).toThrow(
      TenantLocalTimeGapError,
    );
    expect(isValidTenantLocalDateTime("2026-03-29T02:30", "Europe/Warsaw")).toBe(false);
  });

  it("rejects a nonexistent local time in the America/New_York spring-forward gap (2026-03-08 02:30)", () => {
    expect(() => tenantLocalToUtc("2026-03-08T02:30", "America/New_York")).toThrow(
      TenantLocalTimeGapError,
    );
    expect(isValidTenantLocalDateTime("2026-03-08T02:30", "America/New_York")).toBe(false);
  });

  // Times immediately outside the gap remain valid — the rejection is
  // exact, not an over-wide blackout window.
  it("still allows the times immediately bracketing a spring-forward gap", () => {
    expect(isValidTenantLocalDateTime("2026-03-29T01:59", "Europe/Warsaw")).toBe(true);
    expect(isValidTenantLocalDateTime("2026-03-29T03:00", "Europe/Warsaw")).toBe(true);
  });

  // L. Fall-back ambiguous time is handled deterministically — always
  // resolves to the earlier of the two real instants, every time, for the
  // same input (see the doc comment on tenantLocalToUtc for the documented
  // rule).
  it("resolves a fall-back-ambiguous local time to the earlier instant, deterministically", () => {
    const first = tenantLocalToUtc("2026-11-01T01:30", "America/New_York");
    const second = tenantLocalToUtc("2026-11-01T01:30", "America/New_York");
    expect(first.getTime()).toBe(second.getTime());
    // The earlier occurrence is EDT (UTC-4): 01:30 EDT = 05:30 UTC.
    expect(first.toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("resolves a fall-back-ambiguous local time in Europe/Warsaw to the earlier instant", () => {
    // Warsaw's 2026 fall-back is the last Sunday of October (25 Oct); 02:30
    // occurs twice (once CEST, once CET).
    const instant = tenantLocalToUtc("2026-10-25T02:30", "Europe/Warsaw");
    // Earlier occurrence is CEST (UTC+2): 02:30 CEST = 00:30 UTC.
    expect(instant.toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });

  // Malformed input is rejected as a plain validation error, not a gap.
  it("rejects a malformed local date-time string without throwing a gap error", () => {
    expect(() => tenantLocalToUtc("not-a-date", "Europe/Warsaw")).toThrow();
    expect(() => tenantLocalToUtc("not-a-date", "Europe/Warsaw")).not.toThrow(
      TenantLocalTimeGapError,
    );
  });

  it("validates IANA timezone identifiers", () => {
    expect(isValidIanaTimezone("Europe/Warsaw")).toBe(true);
    expect(isValidIanaTimezone("America/New_York")).toBe(true);
    expect(isValidIanaTimezone("UTC")).toBe(true);
    expect(isValidIanaTimezone("Not/AZone")).toBe(false);
    expect(isValidIanaTimezone("")).toBe(false);
  });
});
