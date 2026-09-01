import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { classifyAgingBucket, derivePaymentStatus, type AgingBucket } from "../payments/payment-status.util";

/** Invoice statuses that represent a genuine outstanding receivable — never DRAFT (not yet issued) or a terminal void/replace state. Matches PaymentsService.PAYABLE_STATUSES minus the fully-resolved PAID state, since a PAID invoice contributes nothing to outstanding/aging by definition. */
const OUTSTANDING_STATUSES = ["ISSUED", "SENT", "PARTIALLY_PAID", "OVERDUE"] as const;
/** Every non-DRAFT, non-terminal-void status a real invoiced amount was ever issued under — used by the financial summary's "amount invoiced" figure, deliberately including PAID (an invoice that has since been fully paid was still genuinely invoiced). */
const ISSUED_STATUSES = ["ISSUED", "SENT", "PARTIALLY_PAID", "OVERDUE", "PAID"] as const;

export interface AgingBucketRow {
  bucket: AgingBucket;
  currency: string;
  invoiceCount: number;
  outstandingMinor: number;
}

export interface FinancialSummaryRow {
  currency: string;
  invoicedMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  overdueMinor: number;
}

/**
 * Havelio Receivable Aging Foundation / Financial Summary API Foundation
 * (docs/PRODUCT_BIBLE.md) — server-side domain queries a future Financial
 * Reports module will consume. Deliberately NOT the reports module itself:
 * no charts, no UI, just correct, reusable, currency-grouped aggregates
 * (see docs/DECISIONS.md — "never a misleading total across mixed
 * currencies"). Every method groups by currency; nothing here ever sums
 * two different currencies into one number.
 */
@Injectable()
export class ReceivablesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Buckets every currently-outstanding invoice (remaining > 0, not
   * DRAFT/CANCELLED/CORRECTED/PAID) by how many days past its due date it
   * is — NOT_DUE for anything not yet due or with no due date at all.
   * `asOf` lets a future report ask "what did aging look like on this
   * past date" — defaults to now.
   */
  async getAgingBuckets(tenantId: string, asOf: Date = new Date()): Promise<AgingBucketRow[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, deletedAt: null, status: { in: [...OUTSTANDING_STATUSES] } },
      select: { id: true, currency: true, totalMinor: true, dueDate: true },
    });
    if (invoices.length === 0) return [];

    const paidByInvoice = await this.sumPaidByInvoice(
      tenantId,
      invoices.map((i) => i.id),
    );

    const buckets = new Map<string, AgingBucketRow>();
    for (const invoice of invoices) {
      const paidMinor = paidByInvoice.get(invoice.id) ?? 0;
      const derived = derivePaymentStatus({
        totalMinor: invoice.totalMinor,
        paidMinor,
        dueDate: invoice.dueDate,
        now: asOf,
      });
      if (derived.remainingMinor <= 0) continue;

      const bucket = classifyAgingBucket(derived.overdueDays);
      const key = `${bucket}::${invoice.currency}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.invoiceCount += 1;
        existing.outstandingMinor += derived.remainingMinor;
      } else {
        buckets.set(key, {
          bucket,
          currency: invoice.currency,
          invoiceCount: 1,
          outstandingMinor: derived.remainingMinor,
        });
      }
    }

    return [...buckets.values()].sort(
      (a, b) => a.currency.localeCompare(b.currency) || AGING_BUCKET_ORDER[a.bucket] - AGING_BUCKET_ORDER[b.bucket],
    );
  }

  /**
   * Per-currency totals for a date range — the building block a future
   * Financial Reports screen (current month, last 30 days, quarter, custom
   * range, ...) will call with whatever UTC instants it has already
   * resolved from the tenant's own timezone (see docs/DECISIONS.md —
   * timezone-aware calendar-boundary resolution is that future screen's
   * job, not this foundation endpoint's; `from`/`to` here are already
   * absolute instants, the same convention `QueryInvoicesDto.dueDateFrom/
   * dueDateTo` already uses).
   *
   *  - `invoicedMinor`: totalMinor of every invoice ISSUED (issueDate) in range.
   *  - `paidMinor`: sum of non-voided Payment rows dated in range.
   *  - `outstandingMinor`/`overdueMinor`: a snapshot as of `to` (or now),
   *    not range-scoped — "how much is still owed / overdue by the end of
   *    this range," the figure a report actually wants alongside the
   *    range-scoped invoiced/paid numbers.
   */
  async getFinancialSummary(
    tenantId: string,
    range: { from: Date; to: Date },
  ): Promise<FinancialSummaryRow[]> {
    const [invoicedRows, paidRows, outstanding] = await Promise.all([
      this.prisma.invoice.groupBy({
        by: ["currency"],
        where: {
          tenantId,
          deletedAt: null,
          status: { in: [...ISSUED_STATUSES] },
          issueDate: { gte: range.from, lte: range.to },
        },
        _sum: { totalMinor: true },
      }),
      this.prisma.payment.groupBy({
        by: ["currency"],
        where: {
          tenantId,
          voidedAt: null,
          paymentDate: { gte: range.from, lte: range.to },
        },
        _sum: { amountMinor: true },
      }),
      this.getAgingBuckets(tenantId, range.to),
    ]);

    const byCurrency = new Map<string, FinancialSummaryRow>();
    function row(currency: string): FinancialSummaryRow {
      let existing = byCurrency.get(currency);
      if (!existing) {
        existing = { currency, invoicedMinor: 0, paidMinor: 0, outstandingMinor: 0, overdueMinor: 0 };
        byCurrency.set(currency, existing);
      }
      return existing;
    }

    for (const r of invoicedRows) row(r.currency).invoicedMinor = r._sum.totalMinor ?? 0;
    for (const r of paidRows) row(r.currency).paidMinor = r._sum.amountMinor ?? 0;
    for (const bucket of outstanding) {
      const r = row(bucket.currency);
      r.outstandingMinor += bucket.outstandingMinor;
      if (bucket.bucket !== "NOT_DUE") r.overdueMinor += bucket.outstandingMinor;
    }

    return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  }

  private async sumPaidByInvoice(
    tenantId: string,
    invoiceIds: string[],
  ): Promise<Map<string, number>> {
    if (invoiceIds.length === 0) return new Map();
    const rows = await this.prisma.payment.groupBy({
      by: ["invoiceId"],
      where: { tenantId, invoiceId: { in: invoiceIds }, voidedAt: null },
      _sum: { amountMinor: true },
    });
    return new Map(rows.map((r) => [r.invoiceId, r._sum.amountMinor ?? 0]));
  }
}

const AGING_BUCKET_ORDER: Record<AgingBucket, number> = {
  NOT_DUE: 0,
  "1_7_DAYS": 1,
  "8_30_DAYS": 2,
  "31_60_DAYS": 3,
  "61_90_DAYS": 4,
  "90_PLUS_DAYS": 5,
};
