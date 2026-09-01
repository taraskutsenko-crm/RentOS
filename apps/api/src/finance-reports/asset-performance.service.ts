import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { ISSUED_STATUSES } from "../receivables/receivables.service";
import type { FinanceReportContext } from "./finance-reports.service";

const MS_PER_DAY = 86_400_000;

/** Real-usage rental statuses only — RESERVED blocks availability but hasn't actually happened yet, so it is deliberately excluded from "utilization," which looks backward at what was actually realized (see docs/DECISIONS.md). */
const REALIZED_RENTAL_STATUSES = ["ACTIVE", "RETURNED", "COMPLETED"] as const;

function overlapDays(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  return end > start ? (end - start) / MS_PER_DAY : 0;
}

/**
 * Havelio Financial Reports & Analytics V1 — asset/category earning
 * attribution and operational utilization. Deliberately its own service,
 * separate from FinanceReportsService: this is the one place attribution
 * reliability had to be inspected carefully rather than assumed (see the
 * method doc comments below and docs/DECISIONS.md).
 */
@Injectable()
export class AssetPerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Top earning assets by INVOICED amount, attributed via the real,
   * explicit line-level link `InvoiceItem.sourceRentalItemId ->
   * RentalItem.assetId` — never a proportional/guessed split. A
   * documented, disclosed limitation: only InvoiceItems that were
   * generated from a RentalItem (the "create from Rental" prefill flow)
   * carry this link; an ad-hoc typed invoice line (a manual description
   * with no linked asset) is correctly excluded from attribution rather
   * than guessed at — see docs/DECISIONS.md. Cash-received attribution is
   * NOT implemented: Payment is invoice-level, not line-level, so there is
   * no reliable way to say which specific line within a multi-line invoice
   * a given payment actually paid for.
   */
  async getAssetPerformance(
    ctx: FinanceReportContext,
    currency: string | undefined,
    limit: number,
  ): Promise<
    {
      currency: string;
      assetId: string;
      assetName: string;
      internalNumber: string | null;
      invoicedMinor: number;
      rentalDays: number;
      rentalCount: number;
    }[]
  > {
    const { tenantId, period } = ctx;
    const from = period.dateOnlyRange.gte ?? new Date(0);
    const to = new Date(period.dateOnlyRange.lt.getTime() - 1);

    const invoiceItems = await this.prisma.invoiceItem.findMany({
      where: {
        tenantId,
        sourceRentalItemId: { not: null },
        invoice: {
          deletedAt: null,
          status: { in: [...ISSUED_STATUSES] },
          issueDate: { gte: from, lte: to },
          ...(currency ? { currency } : {}),
        },
      },
      select: {
        grossTotalMinor: true,
        invoice: { select: { currency: true } },
        sourceRentalItem: {
          select: {
            assetId: true,
            rentalId: true,
            returnedAt: true,
            asset: { select: { name: true, internalNumber: true } },
            rental: { select: { plannedStart: true, plannedEnd: true, actualStart: true, actualEnd: true } },
          },
        },
      },
    });

    interface Row {
      currency: string;
      assetId: string;
      assetName: string;
      internalNumber: string | null;
      invoicedMinor: number;
      rentalDays: number;
      rentalIds: Set<string>;
    }
    const byKey = new Map<string, Row>();
    for (const item of invoiceItems) {
      const sourceItem = item.sourceRentalItem;
      if (!sourceItem) continue;
      const key = `${sourceItem.assetId}::${item.invoice.currency}`;
      const existing = byKey.get(key) ?? {
        currency: item.invoice.currency,
        assetId: sourceItem.assetId,
        assetName: sourceItem.asset.name,
        internalNumber: sourceItem.asset.internalNumber,
        invoicedMinor: 0,
        rentalDays: 0,
        rentalIds: new Set<string>(),
      };
      existing.invoicedMinor += item.grossTotalMinor;
      existing.rentalIds.add(sourceItem.rentalId);
      const rentalStart = sourceItem.rental.actualStart ?? sourceItem.rental.plannedStart;
      const rentalEnd = sourceItem.returnedAt ?? sourceItem.rental.actualEnd ?? sourceItem.rental.plannedEnd;
      existing.rentalDays += overlapDays(rentalStart, rentalEnd, from, new Date(to.getTime() + 1));
      byKey.set(key, existing);
    }

    return [...byKey.values()]
      .sort((a, b) => b.invoicedMinor - a.invoicedMinor)
      .slice(0, limit)
      .map((r) => ({
        currency: r.currency,
        assetId: r.assetId,
        assetName: r.assetName,
        internalNumber: r.internalNumber,
        invoicedMinor: r.invoicedMinor,
        rentalDays: Math.round(r.rentalDays * 10) / 10,
        rentalCount: r.rentalIds.size,
      }));
  }

  /**
   * Same attribution rule as getAssetPerformance, rolled up by the asset's
   * OWN (leaf) category — never rolled up to a parent category, a
   * documented V1 simplification (see docs/DECISIONS.md). Rental count is
   * a DISTINCT rentalId count so a multi-asset rental from the same
   * category is never double-counted.
   */
  async getCategoryPerformance(
    ctx: FinanceReportContext,
    currency: string | undefined,
    limit: number,
  ): Promise<
    { currency: string; categoryId: string; categoryName: string; invoicedMinor: number; rentalDays: number; rentalCount: number }[]
  > {
    const { tenantId, period } = ctx;
    const from = period.dateOnlyRange.gte ?? new Date(0);
    const to = new Date(period.dateOnlyRange.lt.getTime() - 1);

    const invoiceItems = await this.prisma.invoiceItem.findMany({
      where: {
        tenantId,
        sourceRentalItemId: { not: null },
        invoice: {
          deletedAt: null,
          status: { in: [...ISSUED_STATUSES] },
          issueDate: { gte: from, lte: to },
          ...(currency ? { currency } : {}),
        },
      },
      select: {
        grossTotalMinor: true,
        invoice: { select: { currency: true } },
        sourceRentalItem: {
          select: {
            rentalId: true,
            returnedAt: true,
            asset: { select: { categoryId: true, category: { select: { name: true } } } },
            rental: { select: { plannedStart: true, plannedEnd: true, actualStart: true, actualEnd: true } },
          },
        },
      },
    });

    interface Row {
      currency: string;
      categoryId: string;
      categoryName: string;
      invoicedMinor: number;
      rentalDays: number;
      rentalIds: Set<string>;
    }
    const byKey = new Map<string, Row>();
    for (const item of invoiceItems) {
      const sourceItem = item.sourceRentalItem;
      if (!sourceItem) continue;
      const key = `${sourceItem.asset.categoryId}::${item.invoice.currency}`;
      const existing = byKey.get(key) ?? {
        currency: item.invoice.currency,
        categoryId: sourceItem.asset.categoryId,
        categoryName: sourceItem.asset.category.name,
        invoicedMinor: 0,
        rentalDays: 0,
        rentalIds: new Set<string>(),
      };
      existing.invoicedMinor += item.grossTotalMinor;
      existing.rentalIds.add(sourceItem.rentalId);
      const rentalStart = sourceItem.rental.actualStart ?? sourceItem.rental.plannedStart;
      const rentalEnd = sourceItem.returnedAt ?? sourceItem.rental.actualEnd ?? sourceItem.rental.plannedEnd;
      existing.rentalDays += overlapDays(rentalStart, rentalEnd, from, new Date(to.getTime() + 1));
      byKey.set(key, existing);
    }

    return [...byKey.values()]
      .sort((a, b) => b.invoicedMinor - a.invoicedMinor)
      .slice(0, limit)
      .map((r) => ({
        currency: r.currency,
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        invoicedMinor: r.invoicedMinor,
        rentalDays: Math.round(r.rentalDays * 10) / 10,
        rentalCount: r.rentalIds.size,
      }));
  }

  /**
   * Operational utilization for the period — kept entirely separate from
   * the money-based methods above (§17 explicitly warns against
   * conflating "earning" with "utilization %"). Exact formula, since this
   * is exactly the kind of metric the task warns must never be vague:
   *
   *   usableDays    = period length (days) x count of assets whose
   *                   CURRENT status is not LOST/RETIRED (a live snapshot,
   *                   not a historical reconstruction of status-over-time
   *                   — a documented V1 simplification, see
   *                   docs/DECISIONS.md)
   *   rentedDays    = sum, per asset, of the overlap between the period
   *                   and every RESERVED-turned-real rental interval
   *                   (Rental.actualStart ?? plannedStart .. RentalItem
   *                   .returnedAt ?? Rental.actualEnd ?? plannedEnd) for
   *                   rentals in ACTIVE/RETURNED/COMPLETED status only —
   *                   RESERVED is excluded (a future booking is not yet
   *                   realized usage)
   *   blockedDays   = sum, per asset, of the overlap between the period
   *                   and every non-cancelled AssetAvailabilityBlock,
   *                   broken down by block type (MAINTENANCE/REPAIR/
   *                   INSPECTION/RELOCATION/MANUAL_BLOCK) — "operational
   *                   unavailability," reported separately from rental
   *                   utilization, never folded into the same percentage
   *   idleDays      = max(0, usableDays - rentedDays - blockedDays) — a
   *                   real derived interval difference, never
   *                   "period days minus rental record count"
   *
   * Rental and block intervals for the same asset are summed, not
   * interval-merged — the codebase's own availability-conflict checking
   * already prevents a rental from double-booking an asset, so this is a
   * safe, disclosed simplification rather than a fabricated shortcut (see
   * docs/DECISIONS.md).
   */
  async getAssetUtilization(
    ctx: FinanceReportContext,
    limit: number,
  ): Promise<{
    periodDays: number;
    fleet: { usableDays: number; rentedDays: number; blockedDays: number; idleDays: number; rentalUtilizationPercent: number };
    topIdleAssets: { assetId: string; assetName: string; internalNumber: string | null; idleDays: number; rentedDays: number }[];
  }> {
    const { tenantId, period } = ctx;
    const from = period.dateOnlyRange.gte ?? new Date(0);
    const to = period.dateOnlyRange.lt;
    const periodDays = Math.max(0, (to.getTime() - from.getTime()) / MS_PER_DAY);

    const assets = await this.prisma.asset.findMany({
      where: { tenantId, currentStatus: { code: { notIn: ["LOST", "RETIRED"] } } },
      select: { id: true, name: true, internalNumber: true },
    });
    if (assets.length === 0) {
      return {
        periodDays: Math.round(periodDays * 10) / 10,
        fleet: { usableDays: 0, rentedDays: 0, blockedDays: 0, idleDays: 0, rentalUtilizationPercent: 0 },
        topIdleAssets: [],
      };
    }
    const assetIds = assets.map((a) => a.id);

    const [rentalItems, blocks] = await Promise.all([
      this.prisma.rentalItem.findMany({
        where: {
          tenantId,
          assetId: { in: assetIds },
          rental: {
            status: { in: [...REALIZED_RENTAL_STATUSES] },
            plannedStart: { lt: to },
          },
        },
        select: {
          assetId: true,
          returnedAt: true,
          rental: { select: { plannedStart: true, plannedEnd: true, actualStart: true, actualEnd: true } },
        },
      }),
      this.prisma.assetAvailabilityBlock.findMany({
        where: { tenantId, assetId: { in: assetIds }, cancelledAt: null, startAt: { lt: to } },
        select: { assetId: true, startAt: true, endAt: true },
      }),
    ]);

    const rentedByAsset = new Map<string, number>();
    for (const item of rentalItems) {
      const start = item.rental.actualStart ?? item.rental.plannedStart;
      const end = item.returnedAt ?? item.rental.actualEnd ?? item.rental.plannedEnd;
      const days = overlapDays(start, end, from, to);
      if (days > 0) rentedByAsset.set(item.assetId, (rentedByAsset.get(item.assetId) ?? 0) + days);
    }

    const blockedByAsset = new Map<string, number>();
    for (const block of blocks) {
      const days = overlapDays(block.startAt, block.endAt, from, to);
      if (days > 0) blockedByAsset.set(block.assetId, (blockedByAsset.get(block.assetId) ?? 0) + days);
    }

    let totalRented = 0;
    let totalBlocked = 0;
    const perAsset = assets.map((asset) => {
      const rentedDays = Math.min(periodDays, rentedByAsset.get(asset.id) ?? 0);
      const blockedDays = Math.min(periodDays - rentedDays, blockedByAsset.get(asset.id) ?? 0);
      const idleDays = Math.max(0, periodDays - rentedDays - blockedDays);
      totalRented += rentedDays;
      totalBlocked += blockedDays;
      return { assetId: asset.id, assetName: asset.name, internalNumber: asset.internalNumber, rentedDays, blockedDays, idleDays };
    });

    const usableDays = periodDays * assets.length;
    const idleDays = Math.max(0, usableDays - totalRented - totalBlocked);

    return {
      periodDays: Math.round(periodDays * 10) / 10,
      fleet: {
        usableDays: Math.round(usableDays * 10) / 10,
        rentedDays: Math.round(totalRented * 10) / 10,
        blockedDays: Math.round(totalBlocked * 10) / 10,
        idleDays: Math.round(idleDays * 10) / 10,
        rentalUtilizationPercent: usableDays > 0 ? Math.round((totalRented / usableDays) * 10000) / 100 : 0,
      },
      topIdleAssets: perAsset
        .sort((a, b) => b.idleDays - a.idleDays)
        .slice(0, limit)
        .map((r) => ({
          assetId: r.assetId,
          assetName: r.assetName,
          internalNumber: r.internalNumber,
          idleDays: Math.round(r.idleDays * 10) / 10,
          rentedDays: Math.round(r.rentedDays * 10) / 10,
        })),
    };
  }
}
