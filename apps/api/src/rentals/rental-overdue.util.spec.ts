import { describe, expect, it } from "vitest";

import { deriveOverdueStatus } from "./rental-overdue.util";

const NOW = new Date("2026-08-29T12:00:00Z");
const PAST = new Date("2026-08-27T12:00:00Z");
const FUTURE = new Date("2026-09-05T12:00:00Z");

describe("deriveOverdueStatus", () => {
  it("is not overdue for an ACTIVE rental still inside its planned window", () => {
    const result = deriveOverdueStatus(
      { status: "ACTIVE", plannedEnd: FUTURE },
      [{ returnedAt: null }],
      NOW,
    );
    expect(result).toEqual({ isOverdue: false, overdueSince: null });
  });

  it("is overdue for an ACTIVE rental whose plannedEnd has passed with an unreturned item", () => {
    const result = deriveOverdueStatus(
      { status: "ACTIVE", plannedEnd: PAST },
      [{ returnedAt: null }],
      NOW,
    );
    expect(result).toEqual({ isOverdue: true, overdueSince: PAST });
  });

  it("is not overdue once every item has actually been returned", () => {
    const result = deriveOverdueStatus(
      { status: "ACTIVE", plannedEnd: PAST },
      [{ returnedAt: new Date("2026-08-27T13:00:00Z") }],
      NOW,
    );
    expect(result).toEqual({ isOverdue: false, overdueSince: null });
  });

  it("is overdue when at least one of several items is still unreturned", () => {
    const result = deriveOverdueStatus(
      { status: "ACTIVE", plannedEnd: PAST },
      [{ returnedAt: new Date("2026-08-27T13:00:00Z") }, { returnedAt: null }],
      NOW,
    );
    expect(result.isOverdue).toBe(true);
  });

  it("is never overdue for a RESERVED rental (custody never transferred), even with a past plannedEnd", () => {
    const result = deriveOverdueStatus(
      { status: "RESERVED", plannedEnd: PAST },
      [{ returnedAt: null }],
      NOW,
    );
    expect(result).toEqual({ isOverdue: false, overdueSince: null });
  });

  it("is never overdue for a fully RETURNED rental", () => {
    const result = deriveOverdueStatus(
      { status: "RETURNED", plannedEnd: PAST },
      [{ returnedAt: new Date("2026-08-27T13:00:00Z") }],
      NOW,
    );
    expect(result).toEqual({ isOverdue: false, overdueSince: null });
  });

  it("is never overdue for a DRAFT/QUOTE/CANCELLED/COMPLETED rental", () => {
    for (const status of ["DRAFT", "QUOTE", "CANCELLED", "COMPLETED"] as const) {
      const result = deriveOverdueStatus({ status, plannedEnd: PAST }, [{ returnedAt: null }], NOW);
      expect(result.isOverdue).toBe(false);
    }
  });

  // Boundary: plannedEnd exactly equal to now is not yet overdue (strictly before, not at-or-before).
  it("is not overdue at the exact planned-end instant — only strictly after it", () => {
    const result = deriveOverdueStatus(
      { status: "ACTIVE", plannedEnd: NOW },
      [{ returnedAt: null }],
      NOW,
    );
    expect(result.isOverdue).toBe(false);
  });

  it("is overdue one millisecond after the exact planned-end instant", () => {
    const result = deriveOverdueStatus(
      { status: "ACTIVE", plannedEnd: new Date(NOW.getTime() - 1) },
      [{ returnedAt: null }],
      NOW,
    );
    expect(result.isOverdue).toBe(true);
  });

  it("defaults `now` to the real current instant when omitted", () => {
    const result = deriveOverdueStatus({ status: "ACTIVE", plannedEnd: PAST }, [
      { returnedAt: null },
    ]);
    expect(result.isOverdue).toBe(true);
  });

  it("is never overdue with zero items", () => {
    const result = deriveOverdueStatus({ status: "ACTIVE", plannedEnd: PAST }, [], NOW);
    expect(result.isOverdue).toBe(false);
  });
});
