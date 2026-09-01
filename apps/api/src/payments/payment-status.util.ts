/**
 * Havelio Payments & Receivables — the derived (never manually typed, never
 * stored) payment status of a receivable. Kept entirely separate from
 * `InvoiceStatus` (a business-lifecycle enum — DRAFT/ISSUED/SENT/
 * CANCELLED/CORRECTED, still persisted, still the source of truth for
 * "what stage of its own workflow is this invoice in") — `PaymentStatus`
 * is a pure, orthogonal read model answering only "how much has been paid,
 * and is it overdue," computed live from (totalMinor, paidMinor, dueDate)
 * every time an invoice is rendered, exactly the way `InvoiceStatus` itself
 * is already partly derived (see PaymentsService.recalculateInvoiceStatus /
 * InvoicesService.applyOverdueIfDue). See docs/DECISIONS.md.
 *
 * Decimal-safe by construction: every amount here is an integer minor-unit
 * count (matching D-004's money convention everywhere else in this
 * codebase) — `percentagePaid` is the one derived float, produced from an
 * integer ratio for DISPLAY ONLY, never accumulated or fed back into a
 * money calculation (same convention as `(taxRateBp / 100).toFixed(2)`
 * elsewhere in this codebase).
 */

export type PaymentStatus =
  | "UNPAID"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "PARTIALLY_PAID_OVERDUE";

export interface PaymentStatusInput {
  totalMinor: number;
  paidMinor: number;
  dueDate: Date | null;
  /** Injectable for deterministic tests — defaults to the real current instant. */
  now?: Date;
}

export interface DerivedPaymentStatus {
  status: PaymentStatus;
  remainingMinor: number;
  /** 0–100, rounded to 2 decimal places. 0 when totalMinor is 0 (nothing to pay). */
  percentagePaid: number;
  isOverdue: boolean;
  /** Whole days past the due date — 0 when not overdue. Never negative. */
  overdueDays: number;
  /** Equal to remainingMinor when overdue, else 0 — the amount actually past due. */
  overdueAmountMinor: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Pure derivation — see the module doc comment above for the exact rule
 * table (mirrors the task's PAID/PARTIALLY_PAID/UNPAID/OVERDUE/
 * PARTIALLY_PAID_OVERDUE specification verbatim):
 *
 *   PAID:                      paidMinor >= totalMinor (totalMinor > 0)
 *   PARTIALLY_PAID_OVERDUE:    0 < paidMinor < totalMinor, due date passed
 *   PARTIALLY_PAID:            0 < paidMinor < totalMinor, due date not passed
 *   OVERDUE:                   paidMinor = 0, due date passed
 *   UNPAID:                    paidMinor = 0, due date not passed (or no due date)
 */
export function derivePaymentStatus(input: PaymentStatusInput): DerivedPaymentStatus {
  const now = input.now ?? new Date();
  const totalMinor = Math.max(0, input.totalMinor);
  const paidMinor = Math.max(0, input.paidMinor);
  const remainingMinor = Math.max(0, totalMinor - paidMinor);

  const isPastDue = !!input.dueDate && input.dueDate.getTime() < now.getTime();
  const hasAnyPayment = paidMinor > 0;
  const isFullyPaid = totalMinor > 0 && paidMinor >= totalMinor;

  let status: PaymentStatus;
  if (isFullyPaid) {
    status = "PAID";
  } else if (hasAnyPayment && isPastDue) {
    status = "PARTIALLY_PAID_OVERDUE";
  } else if (hasAnyPayment) {
    status = "PARTIALLY_PAID";
  } else if (isPastDue) {
    status = "OVERDUE";
  } else {
    status = "UNPAID";
  }

  const isOverdue = status === "OVERDUE" || status === "PARTIALLY_PAID_OVERDUE";
  const overdueDays =
    isOverdue && input.dueDate
      ? Math.max(0, Math.floor((now.getTime() - input.dueDate.getTime()) / MS_PER_DAY))
      : 0;

  const percentagePaid =
    totalMinor > 0 ? Math.min(100, Math.round((paidMinor / totalMinor) * 10000) / 100) : 0;

  return {
    status,
    remainingMinor,
    percentagePaid,
    isOverdue,
    overdueDays,
    overdueAmountMinor: isOverdue ? remainingMinor : 0,
  };
}

/** Outstanding-debt aging buckets — Havelio Receivable Aging Foundation (docs/PRODUCT_BIBLE.md). Server-side building blocks for a future Financial Reports module; no analytics UI is built in this pass. */
export type AgingBucket =
  | "NOT_DUE"
  | "1_7_DAYS"
  | "8_30_DAYS"
  | "31_60_DAYS"
  | "61_90_DAYS"
  | "90_PLUS_DAYS";

/** Classifies by whole days overdue (0 or negative = not yet due). */
export function classifyAgingBucket(overdueDays: number): AgingBucket {
  if (overdueDays <= 0) return "NOT_DUE";
  if (overdueDays <= 7) return "1_7_DAYS";
  if (overdueDays <= 30) return "8_30_DAYS";
  if (overdueDays <= 60) return "31_60_DAYS";
  if (overdueDays <= 90) return "61_90_DAYS";
  return "90_PLUS_DAYS";
}
