import { describe, expect, it } from "vitest";

import { deriveRentalAttention, resolveTenantDayBoundaries } from "./rental-attention.util";

const WARSAW = "Europe/Warsaw";
const NEW_YORK = "America/New_York";

describe("resolveTenantDayBoundaries", () => {
  it("resolves today/tomorrow/day-after against the tenant's own timezone, not UTC", () => {
    // 2026-09-01T23:30:00Z is already 2026-09-02 01:30 in Warsaw (CEST, UTC+2).
    const now = new Date("2026-09-01T23:30:00Z");
    const boundaries = resolveTenantDayBoundaries(WARSAW, now);
    // Warsaw's "today" (Sep 2) midnight is 2026-09-02T00:00 local = 2026-09-01T22:00:00Z.
    expect(boundaries.todayStart.toISOString()).toBe("2026-09-01T22:00:00.000Z");
    expect(boundaries.tomorrowStart.toISOString()).toBe("2026-09-02T22:00:00.000Z");
    expect(boundaries.dayAfterTomorrowStart.toISOString()).toBe("2026-09-03T22:00:00.000Z");
  });

  it("the same instant resolves to a different tenant-local day in New York (still Sep 1)", () => {
    const now = new Date("2026-09-01T23:30:00Z");
    const boundaries = resolveTenantDayBoundaries(NEW_YORK, now);
    // New York (EDT, UTC-4) "today" (Sep 1) midnight is 2026-09-01T04:00:00Z.
    expect(boundaries.todayStart.toISOString()).toBe("2026-09-01T04:00:00.000Z");
    expect(boundaries.tomorrowStart.toISOString()).toBe("2026-09-02T04:00:00.000Z");
  });
});

describe("deriveRentalAttention", () => {
  // 1. ACTIVE, plannedEnd yesterday, not returned -> OVERDUE_RETURN
  it("classifies an ACTIVE rental with a past plannedEnd and an unreturned item as OVERDUE_RETURN", () => {
    const boundaries = resolveTenantDayBoundaries(WARSAW, new Date("2026-09-01T12:00:00Z"));
    const result = deriveRentalAttention(
      { status: "ACTIVE", plannedEnd: new Date("2026-08-31T12:00:00Z") },
      [{ returnedAt: null }],
      boundaries,
    );
    expect(result.category).toBe("OVERDUE_RETURN");
    expect(result.overdueSince).toEqual(new Date("2026-08-31T12:00:00Z"));
  });

  // 2. ACTIVE, plannedEnd later today -> ENDING_TODAY, not overdue
  it("classifies an ACTIVE rental ending later today as ENDING_TODAY, never overdue", () => {
    // now = Sep 1, 10:00 Warsaw-local (08:00Z); plannedEnd = Sep 1, 18:00 Warsaw-local (16:00Z).
    const now = new Date("2026-09-01T08:00:00Z");
    const boundaries = resolveTenantDayBoundaries(WARSAW, now);
    const result = deriveRentalAttention(
      { status: "ACTIVE", plannedEnd: new Date("2026-09-01T16:00:00Z") },
      [{ returnedAt: null }],
      boundaries,
    );
    expect(result.category).toBe("ENDING_TODAY");
    expect(result.overdueSince).toBeNull();
  });

  // Exact edge case from the task: before 18:00 local it's ENDING_TODAY, after it's OVERDUE_RETURN.
  it("the exact 18:00-local edge case: ENDING_TODAY at 14:00, OVERDUE_RETURN once past 18:00, same rental", () => {
    const plannedEnd = new Date("2026-09-01T16:00:00Z"); // 18:00 Warsaw-local (CEST, UTC+2)
    const rental = { status: "ACTIVE" as const, plannedEnd };
    const items = [{ returnedAt: null }];

    const at14 = resolveTenantDayBoundaries(WARSAW, new Date("2026-09-01T12:00:00Z")); // 14:00 local
    expect(deriveRentalAttention(rental, items, at14).category).toBe("ENDING_TODAY");

    const at1901 = resolveTenantDayBoundaries(WARSAW, new Date("2026-09-01T17:01:00Z")); // 19:01 local
    expect(deriveRentalAttention(rental, items, at1901).category).toBe("OVERDUE_RETURN");
  });

  // 3. ACTIVE, plannedEnd tomorrow -> ENDING_TOMORROW
  it("classifies an ACTIVE rental ending tomorrow as ENDING_TOMORROW", () => {
    const now = new Date("2026-09-01T08:00:00Z");
    const boundaries = resolveTenantDayBoundaries(WARSAW, now);
    const result = deriveRentalAttention(
      { status: "ACTIVE", plannedEnd: new Date("2026-09-02T09:00:00Z") },
      [{ returnedAt: null }],
      boundaries,
    );
    expect(result.category).toBe("ENDING_TOMORROW");
  });

  // 4. RETURNED with old plannedEnd -> not overdue
  it("never flags a RETURNED rental, even with a long-past plannedEnd", () => {
    const boundaries = resolveTenantDayBoundaries(WARSAW, new Date("2026-09-01T12:00:00Z"));
    const result = deriveRentalAttention(
      { status: "RETURNED", plannedEnd: new Date("2026-08-01T12:00:00Z") },
      [{ returnedAt: new Date("2026-08-01T13:00:00Z") }],
      boundaries,
    );
    expect(result.category).toBeNull();
  });

  // 5. DRAFT with old plannedEnd -> not overdue
  it("never flags a DRAFT rental, even with a past plannedEnd (custody never transferred)", () => {
    const boundaries = resolveTenantDayBoundaries(WARSAW, new Date("2026-09-01T12:00:00Z"));
    const result = deriveRentalAttention(
      { status: "DRAFT", plannedEnd: new Date("2026-08-01T12:00:00Z") },
      [{ returnedAt: null }],
      boundaries,
    );
    expect(result.category).toBeNull();
  });

  it("never flags CANCELLED/QUOTE/RESERVED/COMPLETED rentals", () => {
    const boundaries = resolveTenantDayBoundaries(WARSAW, new Date("2026-09-01T12:00:00Z"));
    for (const status of ["CANCELLED", "QUOTE", "RESERVED", "COMPLETED"] as const) {
      const result = deriveRentalAttention(
        { status, plannedEnd: new Date("2026-09-01T16:00:00Z") },
        [{ returnedAt: null }],
        boundaries,
      );
      expect(result.category).toBeNull();
    }
  });

  // 6. Warsaw timezone boundary
  it("Warsaw boundary: a plannedEnd just after Warsaw midnight is ENDING_TOMORROW, not ENDING_TODAY, for a 23:50 Warsaw-local 'now'", () => {
    // now = 2026-09-01T21:50:00Z = 23:50 Warsaw-local (still Sep 1 in Warsaw).
    const now = new Date("2026-09-01T21:50:00Z");
    const boundaries = resolveTenantDayBoundaries(WARSAW, now);
    // plannedEnd = 2026-09-02T00:10:00Z = 02:10 Warsaw-local on Sep 2 — tomorrow.
    const result = deriveRentalAttention(
      { status: "ACTIVE", plannedEnd: new Date("2026-09-02T00:10:00Z") },
      [{ returnedAt: null }],
      boundaries,
    );
    expect(result.category).toBe("ENDING_TOMORROW");
  });

  // 7. New York timezone boundary
  it("New York boundary: the same UTC instant that is ENDING_TOMORROW in Warsaw can be ENDING_TODAY in New York", () => {
    // now = 2026-09-01T23:00:00Z = 19:00 New York-local (EDT, UTC-4) on Sep 1.
    const now = new Date("2026-09-01T23:00:00Z");
    const boundaries = resolveTenantDayBoundaries(NEW_YORK, now);
    // plannedEnd = 2026-09-02T02:00:00Z = 22:00 New York-local, still Sep 1 — today.
    const result = deriveRentalAttention(
      { status: "ACTIVE", plannedEnd: new Date("2026-09-02T02:00:00Z") },
      [{ returnedAt: null }],
      boundaries,
    );
    expect(result.category).toBe("ENDING_TODAY");
  });

  it("a rental whose plannedEnd is neither today nor tomorrow gets no attention category", () => {
    const boundaries = resolveTenantDayBoundaries(WARSAW, new Date("2026-09-01T08:00:00Z"));
    const result = deriveRentalAttention(
      { status: "ACTIVE", plannedEnd: new Date("2026-09-10T08:00:00Z") },
      [{ returnedAt: null }],
      boundaries,
    );
    expect(result.category).toBeNull();
  });
});
