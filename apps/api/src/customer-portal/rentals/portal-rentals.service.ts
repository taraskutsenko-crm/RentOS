import { Injectable, NotFoundException } from "@nestjs/common";

import type { PaginatedResult } from "../../customers/customers.service";
import { derivePaymentStatus } from "../../payments/payment-status.util";
import { PrismaService } from "../../prisma/prisma.service";
import { RentalsService } from "../../rentals/rentals.service";
import type { RentalTimelineEvent } from "../../rentals/timeline.types";
import type { QueryPortalRentalsDto } from "../dto/query-portal-rentals.dto";
import {
  toPortalRentalDetail,
  toPortalRentalListItem,
  type PortalRentalDetail,
  type PortalRentalInvoiceFinancials,
  type PortalRentalListItem,
} from "./portal-rental.types";

/**
 * A thin, ownership-enforcing wrapper around RentalsService — no rental
 * business logic (pricing, availability, lifecycle) is duplicated here.
 * RentalsService.findOne/timeline don't themselves filter by customer (a
 * staff caller may look up any rental in the tenant), so this layer adds
 * that check on top, returning the exact same 404 shape whether the rental
 * doesn't exist or belongs to a different customer — never distinguishing
 * the two, so a customer can't probe for another customer's rental ids.
 */
@Injectable()
export class PortalRentalsService {
  constructor(
    private readonly rentalsService: RentalsService,
    private readonly prisma: PrismaService,
  ) {}

  async findMany(
    tenantId: string,
    customerId: string,
    query: QueryPortalRentalsDto,
  ): Promise<PaginatedResult<PortalRentalListItem>> {
    const result = await this.rentalsService.findMany(tenantId, { ...query, customerId });
    return { ...result, items: result.items.map(toPortalRentalListItem) };
  }

  async findOne(tenantId: string, customerId: string, id: string): Promise<PortalRentalDetail> {
    const rental = await this.rentalsService.findOne(tenantId, id);
    if (rental.customerId !== customerId) {
      throw new NotFoundException("Rental not found");
    }
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const invoiceFinancials = await this.loadInvoiceFinancials(tenantId, id);
    return toPortalRentalDetail(rental, tenant.timezone, invoiceFinancials);
  }

  /**
   * Havelio Payments & Receivables (docs/PRODUCT_BIBLE.md, Phase 24) — a
   * customer-safe amount-due/paid/outstanding/overdue summary per
   * non-DRAFT Invoice linked to this Rental. Never exposes internal
   * notes, audit metadata, or a raw storage path — only the same
   * derived payment figures the staff app itself shows.
   */
  private async loadInvoiceFinancials(
    tenantId: string,
    rentalId: string,
  ): Promise<PortalRentalInvoiceFinancials[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, rentalId, deletedAt: null, status: { not: "DRAFT" } },
      select: { id: true, invoiceNumber: true, currency: true, totalMinor: true, dueDate: true },
      orderBy: { issueDate: "asc" },
    });
    if (invoices.length === 0) return [];

    const paidRows = await this.prisma.payment.groupBy({
      by: ["invoiceId"],
      where: { tenantId, invoiceId: { in: invoices.map((i) => i.id) }, voidedAt: null },
      _sum: { amountMinor: true },
    });
    const paidByInvoice = new Map(paidRows.map((r) => [r.invoiceId, r._sum.amountMinor ?? 0]));

    return invoices.map((invoice) => {
      const paidMinor = paidByInvoice.get(invoice.id) ?? 0;
      const derived = derivePaymentStatus({
        totalMinor: invoice.totalMinor,
        paidMinor,
        dueDate: invoice.dueDate,
      });
      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        currency: invoice.currency,
        totalMinor: invoice.totalMinor,
        paidMinor,
        remainingMinor: derived.remainingMinor,
        dueDate: invoice.dueDate?.toISOString() ?? null,
        paymentStatus: derived.status,
        isOverdue: derived.isOverdue,
        overdueDays: derived.overdueDays,
      };
    });
  }

  async timeline(tenantId: string, customerId: string, id: string): Promise<RentalTimelineEvent[]> {
    await this.findOne(tenantId, customerId, id);
    return this.rentalsService.timeline(tenantId, id);
  }
}
