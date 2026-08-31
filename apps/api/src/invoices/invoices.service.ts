import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type InvoiceStatus } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { CompanyBankAccountsService } from "../bank-accounts/company-bank-accounts.service";
import { resolveDefaultDocumentLanguage } from "../documents/rendering/document-language-resolver.util";
import { PrismaService } from "../prisma/prisma.service";
import {
  computeItemLineTotalMinor,
  type PricedRentalItemInput,
} from "../rentals/rental-pricing.util";
import { StorageService } from "../storage/storage.service";
import type { CreateInvoiceDto } from "./dto/create-invoice.dto";
import type { InvoiceItemDto } from "./dto/invoice-item.dto";
import type { QueryInvoicesDto } from "./dto/query-invoices.dto";
import type { UpdateInvoiceDto } from "./dto/update-invoice.dto";
import { computeInvoiceTotals, type PricedInvoiceItemInput } from "./invoice-pricing.util";
import type { InvoiceDetailView, InvoiceWithRelations, PaginatedInvoices } from "./invoice.types";
import { generateInvoiceNumber } from "./invoice-numbering.util";

/** Statuses from which an already-issued invoice may still be voided — PAID/CANCELLED/CORRECTED cannot. */
const CANCELLABLE_STATUSES: InvoiceStatus[] = [
  "DRAFT",
  "ISSUED",
  "SENT",
  "PARTIALLY_PAID",
  "OVERDUE",
];
/** Statuses OVERDUE derivation applies to — a lazily-applied, read-time transition (see applyOverdueIfDue, mirrors QuotesService.applyExpiryIfDue). */
const OVERDUE_ELIGIBLE_STATUSES: InvoiceStatus[] = ["ISSUED", "SENT", "PARTIALLY_PAID"];

const INVOICE_INCLUDE = {
  items: { orderBy: { sortOrder: "asc" as const } },
  customer: { select: { id: true, firstName: true, lastName: true, company: true } },
  rental: { select: { id: true, rentalNumber: true } },
  bankAccount: { select: { id: true, label: true, iban: true, swiftBic: true, currency: true } },
} satisfies Prisma.InvoiceInclude;

interface PrefillResult {
  customerId: string;
  currency: string;
  sourceQuoteId: string | null;
  notes: string | null;
  items: InvoiceItemDto[];
}

/**
 * Invoice is a first-class business object with its own numbering,
 * snapshotting, and payment-tracking — see the schema banner comment above
 * `model Invoice` and docs/DECISIONS.md. Deliberately does NOT assume one
 * Rental = one Invoice: `rentalId` is a plain nullable FK, never checked
 * or limited here, so upfront/after-return/per-period/deposit-separate/
 * services-separate invoicing patterns are all just "create another
 * Invoice with the same rentalId."
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly bankAccountsService: CompanyBankAccountsService,
    private readonly storageService: StorageService,
  ) {}

  async findMany(tenantId: string, query: QueryInvoicesDto): Promise<PaginatedInvoices> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.InvoiceWhereInput = { tenantId, deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.customerId) where.customerId = query.customerId;
    if (query.rentalId) where.rentalId = query.rentalId;
    if (query.search) {
      where.OR = [
        { invoiceNumber: { contains: query.search, mode: "insensitive" } },
        { customer: { firstName: { contains: query.search, mode: "insensitive" } } },
        { customer: { lastName: { contains: query.search, mode: "insensitive" } } },
        { customer: { company: { contains: query.search, mode: "insensitive" } } },
      ];
    }
    if (query.issueDateFrom || query.issueDateTo) {
      where.issueDate = {
        ...(query.issueDateFrom ? { gte: new Date(query.issueDateFrom) } : {}),
        ...(query.issueDateTo ? { lte: new Date(query.issueDateTo) } : {}),
      };
    }
    if (query.dueDateFrom || query.dueDateTo) {
      where.dueDate = {
        ...(query.dueDateFrom ? { gte: new Date(query.dueDateFrom) } : {}),
        ...(query.dueDateTo ? { lte: new Date(query.dueDateTo) } : {}),
      };
    }

    const sortBy = query.sortBy ?? "createdAt";
    const sortDirection = query.sortDirection ?? "desc";

    const [total, invoices] = await this.prisma.$transaction([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        include: INVOICE_INCLUDE,
        orderBy: { [sortBy]: sortDirection },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const withOverdueApplied = await Promise.all(
      invoices.map((invoice) => this.applyOverdueIfDue(tenantId, invoice)),
    );

    const paidByInvoice = await this.sumPaymentsForMany(
      tenantId,
      withOverdueApplied.map((invoice) => invoice.id),
    );

    return {
      data: withOverdueApplied.map((invoice) =>
        this.toDetailView(invoice, paidByInvoice.get(invoice.id) ?? 0),
      ),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async findOne(tenantId: string, id: string): Promise<InvoiceDetailView> {
    const invoice = await this.findRaw(tenantId, id);
    const current = await this.applyOverdueIfDue(tenantId, invoice);
    const paidMinor = await this.sumPayments(tenantId, id);
    return this.toDetailView(current, paidMinor);
  }

  async create(
    tenantId: string,
    actorUserId: string,
    dto: CreateInvoiceDto,
  ): Promise<InvoiceDetailView> {
    let prefill: PrefillResult | null = null;
    if (dto.rentalId) {
      prefill = await this.prefillFromRental(tenantId, dto.rentalId);
    }

    const customerId = dto.customerId ?? prefill?.customerId;
    if (!customerId) {
      throw new BadRequestException("customerId or rentalId is required");
    }

    const items = dto.items ?? prefill?.items ?? [];
    if (items.length === 0) {
      throw new BadRequestException("At least one invoice item is required");
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { defaultCurrency: true },
    });
    const currency = dto.currency ?? prefill?.currency ?? tenant.defaultCurrency;

    const bankAccountId =
      dto.bankAccountId !== undefined
        ? dto.bankAccountId
        : ((await this.bankAccountsService.findDefault(tenantId))?.id ?? null);

    const { sellerSnapshot, buyerSnapshot, bankSnapshot, documentLanguage } =
      await this.buildSnapshots(tenantId, customerId, bankAccountId);

    const totals = computeInvoiceTotals(toPricedItems(items));
    const issueDate = dto.issueDate ? new Date(dto.issueDate) : new Date();
    const notes = dto.notes !== undefined ? dto.notes : (prefill?.notes ?? null);

    const invoiceId = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          // A DRAFT never holds a real sequential number — see
          // invoice-numbering.util.ts: numbers are reserved only at issue
          // time so an abandoned draft never burns a gap in the sequence.
          invoiceNumber: `DRAFT-${randomUUID()}`,
          type: dto.type ?? "STANDARD",
          status: "DRAFT",
          issueDate,
          saleDate: dto.saleDate ? new Date(dto.saleDate) : null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          currency,
          documentLanguage,
          customerId,
          rentalId: dto.rentalId ?? null,
          sourceQuoteId: prefill?.sourceQuoteId ?? null,
          bankAccountId,
          sellerSnapshot: sellerSnapshot as Prisma.InputJsonValue,
          buyerSnapshot: buyerSnapshot as Prisma.InputJsonValue,
          bankSnapshot: (bankSnapshot as Prisma.InputJsonValue | null) ?? Prisma.DbNull,
          subtotalMinor: totals.subtotalMinor,
          discountMinor: totals.discountMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          notes,
          createdByUserId: actorUserId,
        },
      });

      await this.writeItems(tx, tenantId, invoice.id, items, totals);

      await tx.invoiceStatusHistory.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          fromStatus: null,
          toStatus: "DRAFT",
          changedByUserId: actorUserId,
        },
      });
      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "invoice.created",
          entityType: "Invoice",
          entityId: invoice.id,
          metadata: { rentalId: dto.rentalId ?? null },
        },
        tx,
      );

      return invoice.id;
    });

    return this.findOne(tenantId, invoiceId);
  }

  async update(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: UpdateInvoiceDto,
  ): Promise<InvoiceDetailView> {
    const current = await this.findRaw(tenantId, id);
    if (current.status !== "DRAFT") {
      throw new ConflictException(
        `Only a DRAFT invoice can be edited (current status: ${current.status}) — an issued invoice is a legal record`,
      );
    }

    const customerId = dto.customerId ?? current.customerId;
    const bankAccountId =
      dto.bankAccountId !== undefined ? dto.bankAccountId : current.bankAccountId;
    const { sellerSnapshot, buyerSnapshot, bankSnapshot, documentLanguage } =
      await this.buildSnapshots(tenantId, customerId, bankAccountId);

    const items: InvoiceItemDto[] =
      dto.items ??
      current.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitNetPriceMinor: item.unitNetPriceMinor,
        discountMinor: item.discountMinor,
        taxRateBp: item.taxRateBp,
        ...(item.sourceRentalItemId ? { sourceRentalItemId: item.sourceRentalItemId } : {}),
      }));
    if (items.length === 0) {
      throw new BadRequestException("At least one invoice item is required");
    }
    const totals = computeInvoiceTotals(toPricedItems(items));

    await this.prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          customerId,
          ...(dto.issueDate !== undefined ? { issueDate: new Date(dto.issueDate) } : {}),
          ...(dto.saleDate !== undefined
            ? { saleDate: dto.saleDate ? new Date(dto.saleDate) : null }
            : {}),
          ...(dto.dueDate !== undefined
            ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }
            : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
          bankAccountId,
          ...(dto.preferredPaymentMethod !== undefined
            ? { preferredPaymentMethod: dto.preferredPaymentMethod }
            : {}),
          ...(dto.paymentReference !== undefined ? { paymentReference: dto.paymentReference } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          sellerSnapshot: sellerSnapshot as Prisma.InputJsonValue,
          buyerSnapshot: buyerSnapshot as Prisma.InputJsonValue,
          bankSnapshot: (bankSnapshot as Prisma.InputJsonValue | null) ?? Prisma.DbNull,
          documentLanguage,
          subtotalMinor: totals.subtotalMinor,
          discountMinor: totals.discountMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          updatedByUserId: actorUserId,
        },
      });

      if (dto.items) {
        await tx.invoiceItem.deleteMany({ where: { tenantId, invoiceId: id } });
        await this.writeItems(tx, tenantId, id, items, totals);
      }

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "invoice.updated",
          entityType: "Invoice",
          entityId: id,
        },
        tx,
      );
    });

    return this.findOne(tenantId, id);
  }

  /**
   * DRAFT -> ISSUED. Freezes the invoice's snapshots and assigns the real
   * sequential invoice number — both done here, at the one-way transition
   * point, matching the task's "snapshot legally relevant data AT ISSUE
   * TIME" requirement exactly. Once ISSUED, `update()` above refuses to
   * touch this row again.
   */
  async issue(tenantId: string, id: string, actorUserId: string): Promise<InvoiceDetailView> {
    const current = await this.findRaw(tenantId, id);
    if (current.status !== "DRAFT") {
      throw new ConflictException(
        `Only a DRAFT invoice can be issued (current status: ${current.status})`,
      );
    }
    if (current.items.length === 0) {
      throw new BadRequestException("Cannot issue an invoice with no line items");
    }

    // One final "capture now" — in case the DRAFT sat for a while and the
    // Company Profile/Customer/Bank Account changed since it was last
    // saved, the actually-issued snapshot always reflects live data at the
    // moment of issuing, never stale draft-creation-time data.
    const { sellerSnapshot, buyerSnapshot, bankSnapshot, documentLanguage } =
      await this.buildSnapshots(tenantId, current.customerId, current.bankAccountId);

    await this.prisma.$transaction(async (tx) => {
      const invoiceNumber = await generateInvoiceNumber(tx, tenantId, current.issueDate);
      await tx.invoice.update({
        where: { id },
        data: {
          status: "ISSUED",
          invoiceNumber,
          sellerSnapshot: sellerSnapshot as Prisma.InputJsonValue,
          buyerSnapshot: buyerSnapshot as Prisma.InputJsonValue,
          bankSnapshot: (bankSnapshot as Prisma.InputJsonValue | null) ?? Prisma.DbNull,
          documentLanguage,
          updatedByUserId: actorUserId,
        },
      });
      await tx.invoiceStatusHistory.create({
        data: {
          tenantId,
          invoiceId: id,
          fromStatus: "DRAFT",
          toStatus: "ISSUED",
          changedByUserId: actorUserId,
        },
      });
      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "invoice.issued",
          entityType: "Invoice",
          entityId: id,
          metadata: { invoiceNumber },
        },
        tx,
      );
    });

    return this.findOne(tenantId, id);
  }

  async markSent(tenantId: string, id: string, actorUserId: string): Promise<InvoiceDetailView> {
    const current = await this.findRaw(tenantId, id);
    if (current.status !== "ISSUED") {
      throw new ConflictException(
        `Only an ISSUED invoice can be marked as sent (current status: ${current.status})`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: { status: "SENT", sentAt: new Date(), updatedByUserId: actorUserId },
      });
      await tx.invoiceStatusHistory.create({
        data: {
          tenantId,
          invoiceId: id,
          fromStatus: "ISSUED",
          toStatus: "SENT",
          changedByUserId: actorUserId,
        },
      });
      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "invoice.sent",
          entityType: "Invoice",
          entityId: id,
        },
        tx,
      );
    });

    return this.findOne(tenantId, id);
  }

  async cancel(
    tenantId: string,
    id: string,
    actorUserId: string,
    reason: string | null,
  ): Promise<InvoiceDetailView> {
    const current = await this.findRaw(tenantId, id);
    if (current.status === "CANCELLED") {
      return this.findOne(tenantId, id);
    }
    if (!CANCELLABLE_STATUSES.includes(current.status)) {
      throw new ConflictException(`Cannot cancel an invoice with status ${current.status}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: { status: "CANCELLED", updatedByUserId: actorUserId },
      });
      await tx.invoiceStatusHistory.create({
        data: {
          tenantId,
          invoiceId: id,
          fromStatus: current.status,
          toStatus: "CANCELLED",
          changedByUserId: actorUserId,
          reason,
        },
      });
      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "invoice.cancelled",
          entityType: "Invoice",
          entityId: id,
          metadata: { reason },
        },
        tx,
      );
    });

    return this.findOne(tenantId, id);
  }

  // ---------------------------------------------------------------------

  private async findRaw(tenantId: string, id: string): Promise<InvoiceWithRelations> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { tenantId, id, deletedAt: null },
      include: INVOICE_INCLUDE,
    });
    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }
    return invoice;
  }

  /**
   * Lazily derives OVERDUE the same way QuotesService.applyExpiryIfDue
   * derives EXPIRED — a time-driven transition applied (and persisted) the
   * next time the row is read, rather than a cron job. Never overwrites a
   * payment-driven or terminal status.
   */
  private async applyOverdueIfDue(
    tenantId: string,
    invoice: InvoiceWithRelations,
  ): Promise<InvoiceWithRelations> {
    const isEligible = OVERDUE_ELIGIBLE_STATUSES.includes(invoice.status);
    if (!isEligible || !invoice.dueDate || invoice.dueDate.getTime() >= Date.now()) {
      return invoice;
    }

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.invoice.updateMany({
        where: { id: invoice.id, tenantId, status: invoice.status },
        data: { status: "OVERDUE" },
      });
      if (result.count > 0) {
        await tx.invoiceStatusHistory.create({
          data: {
            tenantId,
            invoiceId: invoice.id,
            fromStatus: invoice.status,
            toStatus: "OVERDUE",
            changedByUserId: null,
            reason: "Due date elapsed without full payment",
          },
        });
      }
    });

    return { ...invoice, status: "OVERDUE" };
  }

  private async sumPayments(tenantId: string, invoiceId: string): Promise<number> {
    const result = await this.prisma.payment.aggregate({
      where: { tenantId, invoiceId },
      _sum: { amountMinor: true },
    });
    return result._sum.amountMinor ?? 0;
  }

  private async sumPaymentsForMany(
    tenantId: string,
    invoiceIds: string[],
  ): Promise<Map<string, number>> {
    if (invoiceIds.length === 0) return new Map();
    const rows = await this.prisma.payment.groupBy({
      by: ["invoiceId"],
      where: { tenantId, invoiceId: { in: invoiceIds } },
      _sum: { amountMinor: true },
    });
    return new Map(rows.map((row) => [row.invoiceId, row._sum.amountMinor ?? 0]));
  }

  private toDetailView(invoice: InvoiceWithRelations, paidMinor: number): InvoiceDetailView {
    const remainingMinor = Math.max(0, invoice.totalMinor - paidMinor);
    return {
      id: invoice.id,
      tenantId: invoice.tenantId,
      invoiceNumber: invoice.invoiceNumber,
      type: invoice.type,
      status: invoice.status,
      issueDate: invoice.issueDate.toISOString(),
      saleDate: invoice.saleDate?.toISOString() ?? null,
      dueDate: invoice.dueDate?.toISOString() ?? null,
      sentAt: invoice.sentAt?.toISOString() ?? null,
      currency: invoice.currency,
      documentLanguage: invoice.documentLanguage,
      customerId: invoice.customerId,
      rentalId: invoice.rentalId,
      sourceQuoteId: invoice.sourceQuoteId,
      bankAccountId: invoice.bankAccountId,
      sellerSnapshot: invoice.sellerSnapshot as Record<string, unknown>,
      buyerSnapshot: invoice.buyerSnapshot as Record<string, unknown>,
      bankSnapshot: (invoice.bankSnapshot as Record<string, unknown> | null) ?? null,
      subtotalMinor: invoice.subtotalMinor,
      discountMinor: invoice.discountMinor,
      taxMinor: invoice.taxMinor,
      totalMinor: invoice.totalMinor,
      paidMinor,
      remainingMinor,
      preferredPaymentMethod: invoice.preferredPaymentMethod,
      paymentReference: invoice.paymentReference,
      notes: invoice.notes,
      eInvoiceStatus: invoice.eInvoiceStatus,
      eInvoiceReferenceNumber: invoice.eInvoiceReferenceNumber,
      eInvoiceSubmittedAt: invoice.eInvoiceSubmittedAt?.toISOString() ?? null,
      eInvoiceProcessedAt: invoice.eInvoiceProcessedAt?.toISOString() ?? null,
      eInvoiceError: invoice.eInvoiceError,
      createdByUserId: invoice.createdByUserId,
      updatedByUserId: invoice.updatedByUserId,
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
      items: invoice.items.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitNetPriceMinor: item.unitNetPriceMinor,
        discountMinor: item.discountMinor,
        taxRateBp: item.taxRateBp,
        netTotalMinor: item.netTotalMinor,
        taxTotalMinor: item.taxTotalMinor,
        grossTotalMinor: item.grossTotalMinor,
        sortOrder: item.sortOrder,
        sourceRentalItemId: item.sourceRentalItemId,
      })),
      customer: invoice.customer,
      rental: invoice.rental,
      bankAccount: invoice.bankAccount,
    };
  }

  private async writeItems(
    tx: Prisma.TransactionClient,
    tenantId: string,
    invoiceId: string,
    items: InvoiceItemDto[],
    totals: ReturnType<typeof computeInvoiceTotals>,
  ): Promise<void> {
    for (const [index, item] of items.entries()) {
      const pricing = totals.items[index]!;
      await tx.invoiceItem.create({
        data: {
          tenantId,
          invoiceId,
          description: item.description,
          quantity: item.quantity ?? 1,
          unit: item.unit ?? null,
          unitNetPriceMinor: item.unitNetPriceMinor,
          discountMinor: item.discountMinor ?? 0,
          taxRateBp: item.taxRateBp ?? 0,
          netTotalMinor: pricing.netTotalMinor,
          taxTotalMinor: pricing.taxTotalMinor,
          grossTotalMinor: pricing.grossTotalMinor,
          sortOrder: index,
          sourceRentalItemId: item.sourceRentalItemId ?? null,
        },
      });
    }
  }

  /**
   * Freezes legally relevant Tenant/Customer/CompanyBankAccount data into
   * the three snapshot fields — always read live here, never from a
   * previous snapshot, so a DRAFT stays an accurate live preview and
   * `issue()`'s final call captures whatever is true at that exact moment
   * (see docs/DECISIONS.md). `sellerSnapshot.logoBase64`/`logoMimeType`
   * (Havelio Company Branding) are embedded the same way — a real
   * base64-encoded copy of the tenant's CURRENT logo bytes at snapshot
   * time, not a storage-key reference, so the frozen JSON is fully
   * self-contained: `InvoiceRendererService.render()` never touches
   * storage, and an ISSUED invoice's logo can never change later even if
   * the tenant replaces or deletes its company logo afterward.
   */
  private async buildSnapshots(
    tenantId: string,
    customerId: string,
    bankAccountId: string | null,
  ): Promise<{
    sellerSnapshot: Record<string, unknown>;
    buyerSnapshot: Record<string, unknown>;
    bankSnapshot: Record<string, unknown> | null;
    documentLanguage: string;
  }> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        name: true,
        countryCode: true,
        defaultLanguage: true,
        registrationNumber: true,
        taxNumber: true,
        address: true,
        phone: true,
        logoStorageKey: true,
        logoMimeType: true,
      },
    });
    const logo = await this.loadLogoForSnapshot(tenant);
    const customer = await this.prisma.customer.findFirst({
      where: { tenantId, id: customerId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    const bankAccount = bankAccountId
      ? await this.prisma.companyBankAccount.findFirst({
          where: { tenantId, id: bankAccountId, deletedAt: null },
        })
      : null;

    const documentLanguage = resolveDefaultDocumentLanguage(tenant);

    return {
      sellerSnapshot: {
        name: tenant.name,
        registrationNumber: tenant.registrationNumber ?? "",
        taxNumber: tenant.taxNumber ?? "",
        address: tenant.address ?? "",
        phone: tenant.phone ?? "",
        logoBase64: logo?.base64 ?? "",
        logoMimeType: logo?.mimeType ?? "",
      },
      buyerSnapshot: {
        name: customer.company || `${customer.firstName} ${customer.lastName}`.trim(),
        firstName: customer.firstName,
        lastName: customer.lastName,
        company: customer.company ?? "",
        address: customer.address ?? "",
        phone: customer.phone ?? "",
        email: customer.email ?? "",
        taxNumber: customer.vatNumber ?? "",
      },
      bankSnapshot: bankAccount
        ? {
            label: bankAccount.label,
            bankName: bankAccount.bankName ?? "",
            accountHolder: bankAccount.accountHolder ?? "",
            accountNumber: bankAccount.accountNumber ?? "",
            iban: bankAccount.iban ?? "",
            swiftBic: bankAccount.swiftBic ?? "",
            currency: bankAccount.currency,
            bankAddress: bankAccount.bankAddress ?? "",
            paymentReference: bankAccount.paymentReference ?? "",
          }
        : null,
      documentLanguage,
    };
  }

  /**
   * Reads the tenant's current company logo and base64-encodes it for
   * embedding directly into `sellerSnapshot` (see buildSnapshots' own doc
   * comment for why a copy, not a storage reference). Resilient to a
   * storage read failure — degrades to "no logo" rather than failing
   * invoice creation/issuance.
   */
  private async loadLogoForSnapshot(tenant: {
    logoStorageKey: string | null;
    logoMimeType: string | null;
  }): Promise<{ base64: string; mimeType: string } | null> {
    if (!tenant.logoStorageKey || !tenant.logoMimeType) return null;
    try {
      const bytes = await this.storageService.read(tenant.logoStorageKey);
      return { base64: bytes.toString("base64"), mimeType: tenant.logoMimeType };
    } catch {
      return null;
    }
  }

  /**
   * Prefills customer/currency/line items from a Rental for the "create
   * Invoice from Rental Workspace" flow (see docs/DECISIONS.md). Asset
   * lines reuse `computeItemLineTotalMinor` (the same centralized pricing
   * primitive Rentals themselves are priced with) rather than
   * reinventing the arithmetic. Each RentalItem now carries its own real
   * `taxRateBp` (see the rental tax percentage model, docs/DECISIONS.md),
   * so each invoice line is prefilled with that same item's own rate —
   * never a blended/derived average across items, and never a
   * fabricated/invented rate. When the Rental was converted from a Quote,
   * that Quote's non-asset lines (delivery, installation, cleaning,
   * fees, ...) are prefilled too, so delivery/services are invoiceable
   * exactly like asset lines. The caller always still receives an
   * editable DRAFT before anything is issued.
   */
  private async prefillFromRental(tenantId: string, rentalId: string): Promise<PrefillResult> {
    const rental = await this.prisma.rental.findFirst({
      where: { tenantId, id: rentalId, deletedAt: null },
      include: {
        items: { include: { asset: { select: { name: true } } } },
        sourceQuote: { include: { items: true } },
      },
    });
    if (!rental) {
      throw new NotFoundException("Rental not found");
    }

    const assetItems: InvoiceItemDto[] = rental.items.map((item) => {
      const pricedInput: PricedRentalItemInput = {
        billingMode: item.billingMode,
        quantity: item.quantity,
        dailyPriceMinor: item.dailyPriceMinor,
        weeklyPriceMinor: item.weeklyPriceMinor,
        monthlyPriceMinor: item.monthlyPriceMinor,
        customPriceMinor: item.customPriceMinor,
        monthlyBillingStrategy: item.monthlyBillingStrategy,
        customMonthLengthDays: item.customMonthLengthDays,
        partialMonthPolicy: item.partialMonthPolicy,
        discountMinor: item.discountMinor,
      };
      const netTotalMinor = computeItemLineTotalMinor(
        pricedInput,
        rental.plannedStart,
        rental.plannedEnd,
      );
      return {
        description: item.asset.name,
        quantity: 1,
        unitNetPriceMinor: netTotalMinor,
        taxRateBp: item.taxRateBp,
        sourceRentalItemId: item.id,
      };
    });

    const serviceItems: InvoiceItemDto[] = (rental.sourceQuote?.items ?? [])
      .filter((item) => item.itemType !== "ASSET")
      .map((item) => ({
        description: item.name,
        quantity: item.quantity,
        unitNetPriceMinor:
          item.quantity > 0
            ? Math.round(item.lineSubtotalMinor / item.quantity)
            : item.lineSubtotalMinor,
        taxRateBp: item.taxRateBp,
      }));

    return {
      customerId: rental.customerId,
      currency: rental.currency,
      sourceQuoteId: rental.sourceQuoteId,
      notes: rental.notes,
      items: [...assetItems, ...serviceItems],
    };
  }
}

function toPricedItems(items: InvoiceItemDto[]): PricedInvoiceItemInput[] {
  return items.map((item) => ({
    quantity: item.quantity ?? 1,
    unitNetPriceMinor: item.unitNetPriceMinor,
    discountMinor: item.discountMinor ?? 0,
    taxRateBp: item.taxRateBp ?? 0,
  }));
}
