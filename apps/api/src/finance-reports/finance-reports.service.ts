import { BadRequestException, Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import {
  AGING_BUCKET_ORDER,
  ISSUED_STATUSES,
  OUTSTANDING_STATUSES,
  ReceivablesService,
  type AgingBucketRow,
} from "../receivables/receivables.service";
import { derivePaymentStatus, type AgingBucket } from "../payments/payment-status.util";
import { InvalidReportPeriodError, resolveReportPeriod, type ReportPeriodPreset, type ResolvedPeriod } from "./period.util";
import type { TopCustomersMetric } from "./dto/top-customers-query.dto";

const EPOCH = new Date(0);

/** `to` used for a range's snapshot-as-of instant — one millisecond before the half-open upper bound, i.e. "end of the last included day." */
function asOfFromRange(range: { lt: Date }): Date {
  return new Date(range.lt.getTime() - 1);
}

function effectiveFrom(range: { gte?: Date }): Date {
  return range.gte ?? EPOCH;
}

export interface CurrencyComparisonValue {
  currentMinor: number;
  previousMinor: number;
  /** `null` when there is no previous period to compare against (ALL_TIME) or when the previous value was 0 (see docs/DECISIONS.md — never a misleading Infinity%; the frontend shows "New"/"No prior value" instead). */
  absoluteChangeMinor: number | null;
  percentChange: number | null;
  hasPrevious: boolean;
}

export interface OverviewRow {
  currency: string;
  invoiced: CurrencyComparisonValue;
  cashReceived: CurrencyComparisonValue;
  tax: CurrencyComparisonValue;
  /** Current snapshot — never period-scoped (see docs/DECISIONS.md snapshot-vs-flow distinction). */
  outstandingMinor: number;
  overdueMinor: number;
  /** Snapshot as of the end of the *previous* period, for a "compared to a period ago" reading — still a snapshot comparison, never conflated with the flow metrics above. `null` when there is no previous period (ALL_TIME). */
  outstandingMinorPeriodAgo: number | null;
  overdueMinorPeriodAgo: number | null;
  /**
   * cashReceived (this period) ÷ invoiced (this period) — see
   * docs/DECISIONS.md "Collection rate" for why this specific one of the
   * two possible definitions was chosen (§41's "cash received in selected
   * payment period" view, not the cohort-collection view). `null` when
   * invoiced is 0 for this period (never a misleading percentage).
   */
  collectionRatePercent: number | null;
}

export interface FinanceReportContext {
  tenantId: string;
  timezone: string;
  period: ResolvedPeriod;
}

interface CurrencyTotals {
  invoicedMinor: number;
  cashReceivedMinor: number;
  taxMinor: number;
}

function comparisonValue(current: number, previous: number, hasPrevious: boolean): CurrencyComparisonValue {
  const absoluteChangeMinor = hasPrevious ? current - previous : null;
  const percentChange = hasPrevious && previous !== 0 ? round2((current - previous) / Math.abs(previous) * 100) : null;
  return { currentMinor: current, previousMinor: previous, absoluteChangeMinor, percentChange, hasPrevious };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class FinanceReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receivablesService: ReceivablesService,
  ) {}

  /** Resolves the tenant's own timezone once and builds the shared period — every report method takes the same (tenantId, preset, from?, to?, currency?) shape, so this is the one place that translation happens. */
  async buildContext(
    tenantId: string,
    preset: ReportPeriodPreset,
    custom?: { from?: string; to?: string },
  ): Promise<FinanceReportContext> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { timezone: true },
    });
    try {
      const period = resolveReportPeriod(
        preset,
        tenant.timezone,
        custom?.from && custom?.to ? { from: custom.from, to: custom.to } : undefined,
      );
      return { tenantId, timezone: tenant.timezone, period };
    } catch (error) {
      if (error instanceof InvalidReportPeriodError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private async currencyTotals(
    tenantId: string,
    range: { gte?: Date; lt: Date },
    currency?: string,
  ): Promise<Map<string, CurrencyTotals>> {
    const to = asOfFromRange(range);
    const from = effectiveFrom(range);

    const [invoicedRows, paidRows] = await Promise.all([
      this.prisma.invoice.groupBy({
        by: ["currency"],
        where: {
          tenantId,
          deletedAt: null,
          status: { in: [...ISSUED_STATUSES] },
          issueDate: { gte: from, lte: to },
          ...(currency ? { currency } : {}),
        },
        _sum: { totalMinor: true, taxMinor: true },
      }),
      this.prisma.payment.groupBy({
        by: ["currency"],
        where: {
          tenantId,
          voidedAt: null,
          paymentDate: { gte: from, lte: to },
          ...(currency ? { currency } : {}),
        },
        _sum: { amountMinor: true },
      }),
    ]);

    const byCurrency = new Map<string, CurrencyTotals>();
    function row(cur: string): CurrencyTotals {
      let existing = byCurrency.get(cur);
      if (!existing) {
        existing = { invoicedMinor: 0, cashReceivedMinor: 0, taxMinor: 0 };
        byCurrency.set(cur, existing);
      }
      return existing;
    }
    for (const r of invoicedRows) {
      const t = row(r.currency);
      t.invoicedMinor = r._sum.totalMinor ?? 0;
      t.taxMinor = r._sum.taxMinor ?? 0;
    }
    for (const r of paidRows) {
      row(r.currency).cashReceivedMinor = r._sum.amountMinor ?? 0;
    }
    return byCurrency;
  }

  private async outstandingByCurrency(
    tenantId: string,
    asOf: Date,
    currency?: string,
  ): Promise<Map<string, { outstandingMinor: number; overdueMinor: number }>> {
    const buckets = await this.receivablesService.getAgingBuckets(tenantId, asOf);
    const map = new Map<string, { outstandingMinor: number; overdueMinor: number }>();
    for (const bucket of buckets) {
      if (currency && bucket.currency !== currency) continue;
      const existing = map.get(bucket.currency) ?? { outstandingMinor: 0, overdueMinor: 0 };
      existing.outstandingMinor += bucket.outstandingMinor;
      if (bucket.bucket !== "NOT_DUE") existing.overdueMinor += bucket.outstandingMinor;
      map.set(bucket.currency, existing);
    }
    return map;
  }

  /**
   * The Financial Overview KPI set — per currency, invoiced/cashReceived/tax
   * for the selected period (each with a previous-period comparison),
   * outstanding/overdue as a current snapshot, and the collection rate.
   * Never a cross-currency total (docs/DECISIONS.md).
   */
  async getOverview(ctx: FinanceReportContext, currency?: string): Promise<OverviewRow[]> {
    const { tenantId, period } = ctx;
    const current = await this.currencyTotals(tenantId, period.dateOnlyRange, currency);
    const previous = period.previous
      ? await this.currencyTotals(tenantId, period.previous.dateOnlyRange, currency)
      : null;
    // "Current outstanding/overdue" is always a snapshot as of the TRUE
    // current instant — never as of the end of the selected period (which
    // may be in the future, e.g. viewing "This month" on its 1st day would
    // otherwise misreport a receivable due on the 8th as already overdue
    // by "the 30th"). See docs/PRODUCT_BIBLE.md's snapshot-vs-flow rule.
    const outstandingNow = await this.outstandingByCurrency(tenantId, new Date(), currency);
    // The "a period ago" comparison, by contrast, IS deliberately a
    // historical as-of reconstruction (what was outstanding at the end of
    // the previous period) — a real, different question, computed via the
    // same aging engine's own `asOf` support.
    const outstandingPeriodAgo = period.previous
      ? await this.outstandingByCurrency(tenantId, asOfFromRange(period.previous.dateOnlyRange), currency)
      : null;

    const currencies = new Set<string>([
      ...current.keys(),
      ...(previous?.keys() ?? []),
      ...outstandingNow.keys(),
      ...(currency ? [currency] : []),
    ]);

    const rows: OverviewRow[] = [];
    for (const cur of currencies) {
      const cNow = current.get(cur) ?? { invoicedMinor: 0, cashReceivedMinor: 0, taxMinor: 0 };
      const cPrev = previous?.get(cur) ?? { invoicedMinor: 0, cashReceivedMinor: 0, taxMinor: 0 };
      const hasPrevious = period.previous !== null;
      const outstanding = outstandingNow.get(cur) ?? { outstandingMinor: 0, overdueMinor: 0 };
      const outstandingAgo = outstandingPeriodAgo?.get(cur) ?? { outstandingMinor: 0, overdueMinor: 0 };

      rows.push({
        currency: cur,
        invoiced: comparisonValue(cNow.invoicedMinor, cPrev.invoicedMinor, hasPrevious),
        cashReceived: comparisonValue(cNow.cashReceivedMinor, cPrev.cashReceivedMinor, hasPrevious),
        tax: comparisonValue(cNow.taxMinor, cPrev.taxMinor, hasPrevious),
        outstandingMinor: outstanding.outstandingMinor,
        overdueMinor: outstanding.overdueMinor,
        outstandingMinorPeriodAgo: period.previous ? outstandingAgo.outstandingMinor : null,
        overdueMinorPeriodAgo: period.previous ? outstandingAgo.overdueMinor : null,
        collectionRatePercent: cNow.invoicedMinor > 0 ? round2((cNow.cashReceivedMinor / cNow.invoicedMinor) * 100) : null,
      });
    }

    return rows.sort((a, b) => a.currency.localeCompare(b.currency));
  }

  /**
   * Receivable aging, grouped by currency — a thin reshape of
   * ReceivablesService.getAgingBuckets (never recomputed here) into a
   * per-currency bucket array with every bucket present (0 when empty),
   * in canonical NOT_DUE..90_PLUS_DAYS order — what the aging chart/table
   * actually wants to render.
   */
  async getReceivablesAging(
    tenantId: string,
    currency?: string,
  ): Promise<{ currency: string; buckets: { bucket: AgingBucket; outstandingMinor: number; invoiceCount: number }[] }[]> {
    const rows = await this.receivablesService.getAgingBuckets(tenantId);
    const byCurrency = new Map<string, AgingBucketRow[]>();
    for (const row of rows) {
      if (currency && row.currency !== currency) continue;
      const list = byCurrency.get(row.currency) ?? [];
      list.push(row);
      byCurrency.set(row.currency, list);
    }

    const bucketOrder = Object.keys(AGING_BUCKET_ORDER) as AgingBucket[];
    return [...byCurrency.entries()]
      .map(([cur, currencyRows]) => ({
        currency: cur,
        buckets: bucketOrder.map((bucket) => {
          const found = currencyRows.find((r) => r.bucket === bucket);
          return {
            bucket,
            outstandingMinor: found?.outstandingMinor ?? 0,
            invoiceCount: found?.invoiceCount ?? 0,
          };
        }),
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency));
  }

  /** Sum of non-voided Payment rows per invoiceId — same query shape ReceivablesService's own private helper uses, kept here rather than exported across modules since each caller needs it against a different invoice-id set. */
  private async sumPaidByInvoice(tenantId: string, invoiceIds: string[]): Promise<Map<string, number>> {
    if (invoiceIds.length === 0) return new Map();
    const rows = await this.prisma.payment.groupBy({
      by: ["invoiceId"],
      where: { tenantId, invoiceId: { in: invoiceIds }, voidedAt: null },
      _sum: { amountMinor: true },
    });
    return new Map(rows.map((r) => [r.invoiceId, r._sum.amountMinor ?? 0]));
  }

  /**
   * Customers with the largest current outstanding balance — a snapshot,
   * never period-scoped (see docs/DECISIONS.md). Grouped by currency;
   * never mixes a customer's PLN and EUR balances into one row.
   */
  async getBiggestDebtors(
    tenantId: string,
    currency: string | undefined,
    limit: number,
  ): Promise<
    {
      currency: string;
      customerId: string;
      customerName: string;
      outstandingMinor: number;
      overdueMinor: number;
      oldestDueDate: string | null;
      oldestOverdueDays: number;
      unpaidInvoiceCount: number;
    }[]
  > {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { in: [...OUTSTANDING_STATUSES] },
        ...(currency ? { currency } : {}),
      },
      select: {
        id: true,
        currency: true,
        totalMinor: true,
        dueDate: true,
        customerId: true,
        customer: { select: { firstName: true, lastName: true, company: true } },
      },
    });
    if (invoices.length === 0) return [];

    const paidByInvoice = await this.sumPaidByInvoice(
      tenantId,
      invoices.map((i) => i.id),
    );
    const now = new Date();

    interface Accumulator {
      currency: string;
      customerId: string;
      customerName: string;
      outstandingMinor: number;
      overdueMinor: number;
      oldestDueDate: Date | null;
      oldestOverdueDays: number;
      unpaidInvoiceCount: number;
    }
    const byKey = new Map<string, Accumulator>();

    for (const invoice of invoices) {
      const paidMinor = paidByInvoice.get(invoice.id) ?? 0;
      const derived = derivePaymentStatus({ totalMinor: invoice.totalMinor, paidMinor, dueDate: invoice.dueDate, now });
      if (derived.remainingMinor <= 0) continue;

      const key = `${invoice.customerId}::${invoice.currency}`;
      const existing = byKey.get(key) ?? {
        currency: invoice.currency,
        customerId: invoice.customerId,
        customerName: invoice.customer.company || `${invoice.customer.firstName} ${invoice.customer.lastName}`,
        outstandingMinor: 0,
        overdueMinor: 0,
        oldestDueDate: null,
        oldestOverdueDays: 0,
        unpaidInvoiceCount: 0,
      };
      existing.outstandingMinor += derived.remainingMinor;
      existing.overdueMinor += derived.overdueAmountMinor;
      existing.unpaidInvoiceCount += 1;
      if (invoice.dueDate && (!existing.oldestDueDate || invoice.dueDate.getTime() < existing.oldestDueDate.getTime())) {
        existing.oldestDueDate = invoice.dueDate;
        existing.oldestOverdueDays = derived.overdueDays;
      }
      byKey.set(key, existing);
    }

    return [...byKey.values()]
      .sort((a, b) => b.outstandingMinor - a.outstandingMinor)
      .slice(0, limit)
      .map((row) => ({ ...row, oldestDueDate: row.oldestDueDate ? row.oldestDueDate.toISOString() : null }));
  }

  /**
   * Top customers by the selected metric. "invoiced"/"cashReceived" are
   * period-scoped flow metrics; "outstanding" is always a current snapshot
   * regardless of the selected period (see docs/DECISIONS.md) — never
   * silently blended into one ambiguous ranking.
   */
  async getTopCustomers(
    ctx: FinanceReportContext,
    metric: TopCustomersMetric,
    currency: string | undefined,
    limit: number,
  ): Promise<{ currency: string; customerId: string; customerName: string; amountMinor: number }[]> {
    const { tenantId, period } = ctx;

    if (metric === "outstanding") {
      const debtors = await this.getBiggestDebtors(tenantId, currency, limit);
      return debtors.map((d) => ({
        currency: d.currency,
        customerId: d.customerId,
        customerName: d.customerName,
        amountMinor: d.outstandingMinor,
      }));
    }

    const to = asOfFromRange(period.dateOnlyRange);
    const from = effectiveFrom(period.dateOnlyRange);

    interface Row {
      customerId: string;
      currency: string;
      amountMinor: number;
    }
    let rows: Row[];
    if (metric === "invoiced") {
      const grouped = await this.prisma.invoice.groupBy({
        by: ["customerId", "currency"],
        where: {
          tenantId,
          deletedAt: null,
          status: { in: [...ISSUED_STATUSES] },
          issueDate: { gte: from, lte: to },
          ...(currency ? { currency } : {}),
        },
        _sum: { totalMinor: true },
      });
      rows = grouped.map((g) => ({ customerId: g.customerId, currency: g.currency, amountMinor: g._sum.totalMinor ?? 0 }));
    } else {
      const grouped = await this.prisma.payment.groupBy({
        by: ["invoiceId"],
        where: {
          tenantId,
          voidedAt: null,
          paymentDate: { gte: from, lte: to },
          ...(currency ? { currency } : {}),
        },
        _sum: { amountMinor: true },
      });
      const invoiceIds = grouped.map((g) => g.invoiceId);
      const invoices =
        invoiceIds.length > 0
          ? await this.prisma.invoice.findMany({
              where: { tenantId, id: { in: invoiceIds } },
              select: { id: true, customerId: true, currency: true },
            })
          : [];
      const invoiceById = new Map(invoices.map((i) => [i.id, i]));
      const byKey = new Map<string, Row>();
      for (const g of grouped) {
        const invoice = invoiceById.get(g.invoiceId);
        if (!invoice) continue;
        const key = `${invoice.customerId}::${invoice.currency}`;
        const existing = byKey.get(key) ?? { customerId: invoice.customerId, currency: invoice.currency, amountMinor: 0 };
        existing.amountMinor += g._sum.amountMinor ?? 0;
        byKey.set(key, existing);
      }
      rows = [...byKey.values()];
    }

    const customerIds = [...new Set(rows.map((r) => r.customerId))];
    const customers =
      customerIds.length > 0
        ? await this.prisma.customer.findMany({
            where: { tenantId, id: { in: customerIds } },
            select: { id: true, firstName: true, lastName: true, company: true },
          })
        : [];
    const customerById = new Map(customers.map((c) => [c.id, c]));

    return rows
      .filter((r) => r.amountMinor > 0)
      .sort((a, b) => b.amountMinor - a.amountMinor)
      .slice(0, limit)
      .map((r) => {
        const customer = customerById.get(r.customerId);
        return {
          currency: r.currency,
          customerId: r.customerId,
          customerName: customer
            ? customer.company || `${customer.firstName} ${customer.lastName}`
            : r.customerId,
          amountMinor: r.amountMinor,
        };
      });
  }

  /**
   * Invoiced/cash-received time series for ONE currency (see
   * docs/DECISIONS.md — a chart can never mix currencies, so this method
   * always requires an explicit `currency`, unlike every other report
   * method here which defaults to "every currency"). Groups by month for
   * a period longer than 92 days, by day otherwise — never returns
   * thousands of daily points for an ALL_TIME/multi-year range (§49).
   */
  async getCashSeries(
    ctx: FinanceReportContext,
    currency: string,
  ): Promise<{ granularity: "day" | "month"; points: { date: string; invoicedMinor: number; cashReceivedMinor: number }[] }> {
    const { tenantId, period } = ctx;
    const from = effectiveFrom(period.dateOnlyRange);
    const to = asOfFromRange(period.dateOnlyRange);
    const spanDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
    const granularity: "day" | "month" = spanDays > 92 ? "month" : "day";

    const [invoices, payments] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: [...ISSUED_STATUSES] },
          currency,
          issueDate: { gte: from, lte: to },
        },
        select: { issueDate: true, totalMinor: true },
      }),
      this.prisma.payment.findMany({
        where: { tenantId, voidedAt: null, currency, paymentDate: { gte: from, lte: to } },
        select: { paymentDate: true, amountMinor: true },
      }),
    ]);

    const bucketKey = (d: Date): string =>
      granularity === "month"
        ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
        : d.toISOString().slice(0, 10);

    const points = new Map<string, { invoicedMinor: number; cashReceivedMinor: number }>();
    for (const invoice of invoices) {
      const key = bucketKey(invoice.issueDate);
      const point = points.get(key) ?? { invoicedMinor: 0, cashReceivedMinor: 0 };
      point.invoicedMinor += invoice.totalMinor;
      points.set(key, point);
    }
    for (const payment of payments) {
      const key = bucketKey(payment.paymentDate);
      const point = points.get(key) ?? { invoicedMinor: 0, cashReceivedMinor: 0 };
      point.cashReceivedMinor += payment.amountMinor;
      points.set(key, point);
    }

    return {
      granularity,
      points: [...points.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, values]) => ({ date, ...values })),
    };
  }

  /**
   * Cash-payment analytics for the period: totals, count, average, method
   * breakdown, and the manual-vs-deposit-application split (§12 — a
   * deposit's own *receipt* is never counted as revenue anywhere in this
   * codebase; this only labels which *already-revenue* Payment rows were
   * funded by reallocating a held deposit vs new incoming money).
   */
  async getPaymentsBreakdown(
    ctx: FinanceReportContext,
    currency?: string,
  ): Promise<
    {
      currency: string;
      totalMinor: number;
      count: number;
      averageMinor: number;
      byMethod: { method: string; amountMinor: number; count: number }[];
      bySource: { manual: { amountMinor: number; count: number }; depositApplication: { amountMinor: number; count: number } };
    }[]
  > {
    const { tenantId, period } = ctx;
    const from = effectiveFrom(period.dateOnlyRange);
    const to = asOfFromRange(period.dateOnlyRange);

    const payments = await this.prisma.payment.findMany({
      where: { tenantId, voidedAt: null, paymentDate: { gte: from, lte: to }, ...(currency ? { currency } : {}) },
      select: { currency: true, amountMinor: true, method: true, sourceRentalDepositId: true },
    });

    interface Accumulator {
      currency: string;
      totalMinor: number;
      count: number;
      byMethod: Map<string, { amountMinor: number; count: number }>;
      manual: { amountMinor: number; count: number };
      depositApplication: { amountMinor: number; count: number };
    }
    const byCurrency = new Map<string, Accumulator>();
    for (const payment of payments) {
      const existing =
        byCurrency.get(payment.currency) ??
        ({
          currency: payment.currency,
          totalMinor: 0,
          count: 0,
          byMethod: new Map(),
          manual: { amountMinor: 0, count: 0 },
          depositApplication: { amountMinor: 0, count: 0 },
        } satisfies Accumulator);
      existing.totalMinor += payment.amountMinor;
      existing.count += 1;
      const methodRow = existing.byMethod.get(payment.method) ?? { amountMinor: 0, count: 0 };
      methodRow.amountMinor += payment.amountMinor;
      methodRow.count += 1;
      existing.byMethod.set(payment.method, methodRow);
      const bucket = payment.sourceRentalDepositId ? existing.depositApplication : existing.manual;
      bucket.amountMinor += payment.amountMinor;
      bucket.count += 1;
      byCurrency.set(payment.currency, existing);
    }

    return [...byCurrency.values()]
      .sort((a, b) => a.currency.localeCompare(b.currency))
      .map((row) => ({
        currency: row.currency,
        totalMinor: row.totalMinor,
        count: row.count,
        averageMinor: row.count > 0 ? Math.round(row.totalMinor / row.count) : 0,
        byMethod: [...row.byMethod.entries()]
          .map(([method, v]) => ({ method, ...v }))
          .sort((a, b) => b.amountMinor - a.amountMinor),
        bySource: { manual: row.manual, depositApplication: row.depositApplication },
      }));
  }

  /**
   * Deposit analytics, entirely separate from revenue (§20 — a received
   * deposit is never labeled as revenue anywhere in this section).
   * "currentlyHeld" mirrors RentalDepositsService.computeBalance's exact
   * formula (received − returned − retained − applied), aggregated across
   * every deposit rather than looped one-by-one (avoiding an N+1 query at
   * report scale) — see docs/DECISIONS.md for why this is not considered
   * a second source of truth: it is the same formula, just batched.
   */
  async getDepositSummary(
    ctx: FinanceReportContext,
    currency?: string,
  ): Promise<
    {
      currency: string;
      receivedMinor: number;
      returnedMinor: number;
      retainedMinor: number;
      appliedMinor: number;
      currentlyHeldMinor: number;
    }[]
  > {
    const { tenantId, period } = ctx;
    const from = effectiveFrom(period.dateOnlyRange);
    const to = asOfFromRange(period.dateOnlyRange);
    // Deposit received/returned instants are real UTC instants (D-115), so
    // this uses the period's instantRange, not dateOnlyRange (see
    // period.util.ts's own doc comment for why these two ranges differ).
    const instantFrom = effectiveFrom(ctx.period.instantRange);
    const instantTo = new Date(ctx.period.instantRange.lt.getTime() - 1);

    const [receivedInPeriod, returnedInPeriod, appliedInPeriod, allDeposits] = await Promise.all([
      this.prisma.rentalDeposit.groupBy({
        by: ["currency"],
        where: {
          tenantId,
          receivedAt: { gte: instantFrom, lte: instantTo },
          ...(currency ? { currency } : {}),
        },
        _sum: { receivedAmountMinor: true },
      }),
      this.prisma.rentalDeposit.groupBy({
        by: ["currency"],
        where: {
          tenantId,
          returnedAt: { gte: instantFrom, lte: instantTo },
          ...(currency ? { currency } : {}),
        },
        _sum: { returnedAmountMinor: true, retainedAmountMinor: true },
      }),
      this.prisma.payment.groupBy({
        by: ["currency"],
        where: {
          tenantId,
          voidedAt: null,
          sourceRentalDepositId: { not: null },
          paymentDate: { gte: from, lte: to },
          ...(currency ? { currency } : {}),
        },
        _sum: { amountMinor: true },
      }),
      // "currently held" is always a NOW snapshot, independent of the
      // selected period (see docs/DECISIONS.md snapshot-vs-flow) — every
      // ever-received deposit contributes, not just ones received within
      // the period.
      this.prisma.rentalDeposit.findMany({
        where: { tenantId, receivedAt: { not: null }, ...(currency ? { currency } : {}) },
        select: { id: true, currency: true, receivedAmountMinor: true, returnedAmountMinor: true, retainedAmountMinor: true },
      }),
    ]);

    const appliedByDeposit = await this.prisma.payment.groupBy({
      by: ["sourceRentalDepositId"],
      where: { tenantId, voidedAt: null, sourceRentalDepositId: { not: null } },
      _sum: { amountMinor: true },
    });
    const appliedByDepositId = new Map(appliedByDeposit.map((r) => [r.sourceRentalDepositId!, r._sum.amountMinor ?? 0]));

    interface Row {
      currency: string;
      receivedMinor: number;
      returnedMinor: number;
      retainedMinor: number;
      appliedMinor: number;
      currentlyHeldMinor: number;
    }
    const byCurrency = new Map<string, Row>();
    function row(cur: string): Row {
      let existing = byCurrency.get(cur);
      if (!existing) {
        existing = { currency: cur, receivedMinor: 0, returnedMinor: 0, retainedMinor: 0, appliedMinor: 0, currentlyHeldMinor: 0 };
        byCurrency.set(cur, existing);
      }
      return existing;
    }
    for (const r of receivedInPeriod) row(r.currency).receivedMinor = r._sum.receivedAmountMinor ?? 0;
    for (const r of returnedInPeriod) {
      const target = row(r.currency);
      target.returnedMinor = r._sum.returnedAmountMinor ?? 0;
      target.retainedMinor = r._sum.retainedAmountMinor ?? 0;
    }
    for (const r of appliedInPeriod) row(r.currency).appliedMinor = r._sum.amountMinor ?? 0;
    for (const deposit of allDeposits) {
      const applied = appliedByDepositId.get(deposit.id) ?? 0;
      const raw =
        (deposit.receivedAmountMinor ?? 0) -
        (deposit.returnedAmountMinor ?? 0) -
        (deposit.retainedAmountMinor ?? 0) -
        applied;
      row(deposit.currency).currentlyHeldMinor += Math.max(0, raw);
    }

    return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  }

  /**
   * Optional small metric (§39): how many currently-overdue-with-balance
   * invoices have at least one PaymentDemand generated vs not. Not a core
   * KPI — a lightweight supplementary count only.
   */
  async getPaymentDemandStats(tenantId: string, currency?: string): Promise<{ demandSent: number; demandNotSent: number }> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { in: [...OUTSTANDING_STATUSES] },
        ...(currency ? { currency } : {}),
      },
      select: {
        id: true,
        totalMinor: true,
        dueDate: true,
        paymentDemands: { select: { id: true }, take: 1 },
      },
    });
    const paidByInvoice = await this.sumPaidByInvoice(
      tenantId,
      invoices.map((i) => i.id),
    );
    const now = new Date();
    let demandSent = 0;
    let demandNotSent = 0;
    for (const invoice of invoices) {
      const paidMinor = paidByInvoice.get(invoice.id) ?? 0;
      const derived = derivePaymentStatus({ totalMinor: invoice.totalMinor, paidMinor, dueDate: invoice.dueDate, now });
      if (!derived.isOverdue || derived.remainingMinor <= 0) continue;
      if (invoice.paymentDemands.length > 0) demandSent += 1;
      else demandNotSent += 1;
    }
    return { demandSent, demandNotSent };
  }

  /**
   * Open-receivables drill-down table (§24) — a current snapshot (never
   * period-scoped, see docs/DECISIONS.md), using the exact same
   * derivePaymentStatus/OUTSTANDING_STATUSES rules as every other
   * receivable view in this codebase. Sorting on the derived
   * outstandingMinor/overdueDays fields happens in-memory after the
   * (already reasonably bounded — "currently outstanding," not "every
   * invoice ever") filtered set is loaded; a documented V1 scaling
   * constraint for tenants with an extreme number of simultaneously open
   * receivables (see docs/DECISIONS.md).
   */
  async getReceivablesTable(
    tenantId: string,
    query: {
      page: number;
      pageSize: number;
      currency?: string | undefined;
      customerId?: string | undefined;
      search?: string | undefined;
      sortBy: "issueDate" | "dueDate" | "totalMinor" | "outstandingMinor" | "overdueDays";
      sortDirection: "asc" | "desc";
    },
  ): Promise<{
    items: {
      invoiceId: string;
      invoiceNumber: string;
      customerId: string;
      customerName: string;
      currency: string;
      issueDate: string;
      dueDate: string | null;
      totalMinor: number;
      paidMinor: number;
      outstandingMinor: number;
      paymentStatus: string;
      overdueDays: number;
    }[];
    total: number;
  }> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { in: [...OUTSTANDING_STATUSES] },
        ...(query.currency ? { currency: query.currency } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.search
          ? {
              OR: [
                { invoiceNumber: { contains: query.search, mode: "insensitive" } },
                { customer: { firstName: { contains: query.search, mode: "insensitive" } } },
                { customer: { lastName: { contains: query.search, mode: "insensitive" } } },
                { customer: { company: { contains: query.search, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        invoiceNumber: true,
        currency: true,
        issueDate: true,
        dueDate: true,
        totalMinor: true,
        customerId: true,
        customer: { select: { firstName: true, lastName: true, company: true } },
      },
    });

    const paidByInvoice = await this.sumPaidByInvoice(
      tenantId,
      invoices.map((i) => i.id),
    );
    const now = new Date();
    const rows = invoices
      .map((invoice) => {
        const paidMinor = paidByInvoice.get(invoice.id) ?? 0;
        const derived = derivePaymentStatus({ totalMinor: invoice.totalMinor, paidMinor, dueDate: invoice.dueDate, now });
        return {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerId: invoice.customerId,
          customerName: invoice.customer.company || `${invoice.customer.firstName} ${invoice.customer.lastName}`,
          currency: invoice.currency,
          issueDate: invoice.issueDate.toISOString(),
          dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : null,
          totalMinor: invoice.totalMinor,
          paidMinor,
          outstandingMinor: derived.remainingMinor,
          paymentStatus: derived.status,
          overdueDays: derived.overdueDays,
          _sortDueDate: invoice.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER,
          _sortIssueDate: invoice.issueDate.getTime(),
        };
      })
      .filter((r) => r.outstandingMinor > 0);

    const dir = query.sortDirection === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (query.sortBy) {
        case "issueDate":
          return dir * (a._sortIssueDate - b._sortIssueDate);
        case "dueDate":
          return dir * (a._sortDueDate - b._sortDueDate);
        case "totalMinor":
          return dir * (a.totalMinor - b.totalMinor);
        case "overdueDays":
          return dir * (a.overdueDays - b.overdueDays);
        default:
          return dir * (a.outstandingMinor - b.outstandingMinor);
      }
    });

    const total = rows.length;
    const start = (query.page - 1) * query.pageSize;
    const items = rows.slice(start, start + query.pageSize).map(({ _sortDueDate, _sortIssueDate, ...rest }) => rest);
    return { items, total };
  }

  /**
   * Payment transaction drill-down table (§25) — period-scoped (a payment
   * "happened" on its paymentDate), voided payments always excluded from
   * this normal view (they contribute nothing to Cash Received — see
   * docs/DECISIONS.md); pagination/filtering push down to the database
   * since every filter/sort key here is a real column.
   */
  async getCashReceivedTable(
    ctx: FinanceReportContext,
    query: {
      page: number;
      pageSize: number;
      currency?: string | undefined;
      customerId?: string | undefined;
      method?: string | undefined;
      search?: string | undefined;
      sortBy: "paymentDate" | "amountMinor";
      sortDirection: "asc" | "desc";
    },
  ): Promise<{
    items: {
      paymentId: string;
      paymentDate: string;
      customerId: string;
      customerName: string;
      invoiceId: string;
      invoiceNumber: string;
      amountMinor: number;
      currency: string;
      method: string;
      source: "manual" | "deposit_application";
      enteredByName: string;
    }[];
    total: number;
  }> {
    const { tenantId, period } = ctx;
    const from = effectiveFrom(period.dateOnlyRange);
    const to = asOfFromRange(period.dateOnlyRange);

    const where = {
      tenantId,
      voidedAt: null,
      paymentDate: { gte: from, lte: to },
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.method ? { method: query.method as never } : {}),
      ...(query.customerId ? { invoice: { customerId: query.customerId } } : {}),
      ...(query.search
        ? {
            OR: [
              { invoice: { invoiceNumber: { contains: query.search, mode: "insensitive" as const } } },
              { invoice: { customer: { firstName: { contains: query.search, mode: "insensitive" as const } } } },
              { invoice: { customer: { lastName: { contains: query.search, mode: "insensitive" as const } } } },
              { invoice: { customer: { company: { contains: query.search, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    };

    const [total, payments] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortDirection },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          paymentDate: true,
          amountMinor: true,
          currency: true,
          method: true,
          sourceRentalDepositId: true,
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              customerId: true,
              customer: { select: { firstName: true, lastName: true, company: true } },
            },
          },
          createdByUser: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    return {
      total,
      items: payments.map((p) => ({
        paymentId: p.id,
        paymentDate: p.paymentDate.toISOString(),
        customerId: p.invoice.customerId,
        customerName: p.invoice.customer.company || `${p.invoice.customer.firstName} ${p.invoice.customer.lastName}`,
        invoiceId: p.invoice.id,
        invoiceNumber: p.invoice.invoiceNumber,
        amountMinor: p.amountMinor,
        currency: p.currency,
        method: p.method,
        source: p.sourceRentalDepositId ? "deposit_application" : "manual",
        enteredByName: `${p.createdByUser.firstName} ${p.createdByUser.lastName}`,
      })),
    };
  }
}
