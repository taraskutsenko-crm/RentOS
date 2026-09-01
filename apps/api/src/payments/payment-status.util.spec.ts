import { describe, expect, it } from "vitest";

import { classifyAgingBucket, derivePaymentStatus } from "./payment-status.util";

const NOW = new Date("2026-09-01T12:00:00.000Z");
function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}
function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

describe("derivePaymentStatus (Havelio Payments & Receivables test matrix)", () => {
  it("1. total 1000, paid 0, due in future -> UNPAID", () => {
    const result = derivePaymentStatus({
      totalMinor: 1000,
      paidMinor: 0,
      dueDate: daysFromNow(5),
      now: NOW,
    });
    expect(result.status).toBe("UNPAID");
    expect(result.remainingMinor).toBe(1000);
    expect(result.percentagePaid).toBe(0);
    expect(result.isOverdue).toBe(false);
    expect(result.overdueDays).toBe(0);
    expect(result.overdueAmountMinor).toBe(0);
  });

  it("2. total 1000, paid 300, due in future -> PARTIALLY_PAID", () => {
    const result = derivePaymentStatus({
      totalMinor: 1000,
      paidMinor: 300,
      dueDate: daysFromNow(5),
      now: NOW,
    });
    expect(result.status).toBe("PARTIALLY_PAID");
    expect(result.remainingMinor).toBe(700);
    expect(result.percentagePaid).toBe(30);
    expect(result.isOverdue).toBe(false);
  });

  it("3. total 1000, paid 1000 -> PAID", () => {
    const result = derivePaymentStatus({
      totalMinor: 1000,
      paidMinor: 1000,
      dueDate: daysFromNow(5),
      now: NOW,
    });
    expect(result.status).toBe("PAID");
    expect(result.remainingMinor).toBe(0);
    expect(result.percentagePaid).toBe(100);
    expect(result.isOverdue).toBe(false);
  });

  it("3b. PAID even when overdue (fully paid trumps due date)", () => {
    const result = derivePaymentStatus({
      totalMinor: 1000,
      paidMinor: 1000,
      dueDate: daysAgo(10),
      now: NOW,
    });
    expect(result.status).toBe("PAID");
    expect(result.isOverdue).toBe(false);
  });

  it("3c. PAID when overpaid (paid > total, e.g. a since-corrected ledger)", () => {
    const result = derivePaymentStatus({
      totalMinor: 1000,
      paidMinor: 1200,
      dueDate: daysFromNow(5),
      now: NOW,
    });
    expect(result.status).toBe("PAID");
    expect(result.remainingMinor).toBe(0);
    expect(result.percentagePaid).toBe(100);
  });

  it("4. total 1000, paid 0, due yesterday -> OVERDUE", () => {
    const result = derivePaymentStatus({
      totalMinor: 1000,
      paidMinor: 0,
      dueDate: daysAgo(1),
      now: NOW,
    });
    expect(result.status).toBe("OVERDUE");
    expect(result.remainingMinor).toBe(1000);
    expect(result.isOverdue).toBe(true);
    expect(result.overdueDays).toBe(1);
    expect(result.overdueAmountMinor).toBe(1000);
  });

  it("5. total 1000, paid 300, due yesterday -> PARTIALLY_PAID_OVERDUE", () => {
    const result = derivePaymentStatus({
      totalMinor: 1000,
      paidMinor: 300,
      dueDate: daysAgo(6),
      now: NOW,
    });
    expect(result.status).toBe("PARTIALLY_PAID_OVERDUE");
    expect(result.remainingMinor).toBe(700);
    expect(result.percentagePaid).toBe(30);
    expect(result.isOverdue).toBe(true);
    expect(result.overdueDays).toBe(6);
    expect(result.overdueAmountMinor).toBe(700);
  });

  it("no due date at all -> never overdue regardless of payment state", () => {
    const result = derivePaymentStatus({ totalMinor: 1000, paidMinor: 0, dueDate: null, now: NOW });
    expect(result.status).toBe("UNPAID");
    expect(result.isOverdue).toBe(false);
  });

  it("zero-total invoice never reports PAID by default (avoids a nonsensical 100% of nothing)", () => {
    const result = derivePaymentStatus({ totalMinor: 0, paidMinor: 0, dueDate: null, now: NOW });
    expect(result.status).toBe("UNPAID");
    expect(result.percentagePaid).toBe(0);
  });

  it("negative paidMinor (e.g. a correcting entry net below zero) floors to 0, never a negative percentage", () => {
    const result = derivePaymentStatus({
      totalMinor: 1000,
      paidMinor: -50,
      dueDate: daysFromNow(5),
      now: NOW,
    });
    expect(result.status).toBe("UNPAID");
    expect(result.percentagePaid).toBe(0);
    expect(result.remainingMinor).toBe(1000);
  });

  it("due exactly at the current instant is not yet overdue (strictly in the past required)", () => {
    const result = derivePaymentStatus({ totalMinor: 1000, paidMinor: 0, dueDate: NOW, now: NOW });
    expect(result.status).toBe("UNPAID");
  });
});

describe("classifyAgingBucket", () => {
  it("buckets by whole overdue days", () => {
    expect(classifyAgingBucket(0)).toBe("NOT_DUE");
    expect(classifyAgingBucket(-3)).toBe("NOT_DUE");
    expect(classifyAgingBucket(1)).toBe("1_7_DAYS");
    expect(classifyAgingBucket(7)).toBe("1_7_DAYS");
    expect(classifyAgingBucket(8)).toBe("8_30_DAYS");
    expect(classifyAgingBucket(30)).toBe("8_30_DAYS");
    expect(classifyAgingBucket(31)).toBe("31_60_DAYS");
    expect(classifyAgingBucket(60)).toBe("31_60_DAYS");
    expect(classifyAgingBucket(61)).toBe("61_90_DAYS");
    expect(classifyAgingBucket(90)).toBe("61_90_DAYS");
    expect(classifyAgingBucket(91)).toBe("90_PLUS_DAYS");
    expect(classifyAgingBucket(400)).toBe("90_PLUS_DAYS");
  });
});
