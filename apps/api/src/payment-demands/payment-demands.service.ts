import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { resolveDefaultDocumentLanguage } from "../documents/rendering/document-language-resolver.util";
import { derivePaymentStatus } from "../payments/payment-status.util";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import type { CreatePaymentDemandDto } from "./dto/create-payment-demand.dto";
import { generatePaymentDemandNumber } from "./payment-demand-numbering.util";
import type { PaymentDemandDetailView } from "./payment-demand.types";

const PAYMENT_DEMAND_INCLUDE = {
  invoice: { select: { id: true, invoiceNumber: true } },
  customer: { select: { id: true, firstName: true, lastName: true, company: true } },
} satisfies Prisma.PaymentDemandInclude;

type PaymentDemandWithRelations = Prisma.PaymentDemandGetPayload<{
  include: typeof PAYMENT_DEMAND_INCLUDE;
}>;

/**
 * Havelio International Payment Demand Foundation (docs/PRODUCT_BIBLE.md) —
 * a country-aware formal collection notice for an overdue Invoice, modeled
 * the same way as Invoice itself (own numbering, own frozen snapshot, own
 * simple status). See the `PaymentDemand` Prisma model's own doc comment
 * for the full architectural rationale, and payment-demand-strings.ts for
 * why this is never a Poland-only "Wezwanie do zapłaty" hard-coded
 * globally.
 */
@Injectable()
export class PaymentDemandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
  ) {}

  async findMany(tenantId: string, invoiceId?: string): Promise<PaymentDemandDetailView[]> {
    const rows = await this.prisma.paymentDemand.findMany({
      where: { tenantId, ...(invoiceId ? { invoiceId } : {}) },
      include: PAYMENT_DEMAND_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toDetailView);
  }

  async findOne(tenantId: string, id: string): Promise<PaymentDemandDetailView> {
    const row = await this.prisma.paymentDemand.findFirst({
      where: { tenantId, id },
      include: PAYMENT_DEMAND_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException("Payment demand not found");
    }
    return toDetailView(row);
  }

  /**
   * Generates a new Payment Demand for an overdue Invoice — see Phase 21's
   * explicit eligibility rule ("balance > 0 AND due date passed"), kept
   * deliberately strict here: this is the FORMAL collection-notice concept
   * (Poland's real "Wezwanie do zapłaty" is a legal document, never a
   * casual reminder), so a softer non-overdue "payment reminder" is out of
   * scope for this pass rather than blurring the two concepts together
   * (see docs/DECISIONS.md — "do not blur reminder vs legal demand").
   */
  async create(
    tenantId: string,
    invoiceId: string,
    actorUserId: string,
    dto: CreatePaymentDemandDto,
  ): Promise<PaymentDemandDetailView> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { tenantId, id: invoiceId, deletedAt: null },
      include: {
        customer: true,
        bankAccount: true,
      },
    });
    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }

    const paidResult = await this.prisma.payment.aggregate({
      where: { tenantId, invoiceId, voidedAt: null },
      _sum: { amountMinor: true },
    });
    const paidMinor = paidResult._sum.amountMinor ?? 0;
    const derived = derivePaymentStatus({
      totalMinor: invoice.totalMinor,
      paidMinor,
      dueDate: invoice.dueDate,
    });

    if (derived.remainingMinor <= 0) {
      throw new ConflictException("This invoice has no outstanding balance");
    }
    if (!derived.isOverdue) {
      throw new ConflictException(
        "A formal payment demand can only be generated for an overdue invoice — this invoice is not yet past its due date",
      );
    }

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
    const documentLanguage = resolveDefaultDocumentLanguage(tenant);

    const issueDate = new Date();
    const created = await this.prisma.$transaction(async (tx) => {
      const demandNumber = await generatePaymentDemandNumber(tx, tenantId, issueDate);
      const row = await tx.paymentDemand.create({
        data: {
          tenantId,
          customerId: invoice.customerId,
          invoiceId: invoice.id,
          demandNumber,
          status: "GENERATED",
          countryCode: tenant.countryCode,
          documentLanguage,
          issueDate,
          originalDueDate: invoice.dueDate,
          requestedDeadline: new Date(dto.requestedDeadline),
          currency: invoice.currency,
          originalAmountMinor: invoice.totalMinor,
          paidAmountMinor: paidMinor,
          outstandingAmountMinor: derived.remainingMinor,
          creditorSnapshot: {
            name: tenant.name,
            registrationNumber: tenant.registrationNumber ?? "",
            taxNumber: tenant.taxNumber ?? "",
            address: tenant.address ?? "",
            phone: tenant.phone ?? "",
            logoBase64: logo?.base64 ?? "",
            logoMimeType: logo?.mimeType ?? "",
          },
          debtorSnapshot: {
            name:
              invoice.customer.company ||
              `${invoice.customer.firstName} ${invoice.customer.lastName}`.trim(),
            firstName: invoice.customer.firstName,
            lastName: invoice.customer.lastName,
            company: invoice.customer.company ?? "",
            address: invoice.customer.address ?? "",
            phone: invoice.customer.phone ?? "",
            email: invoice.customer.email ?? "",
            taxNumber: invoice.customer.vatNumber ?? "",
          },
          ...(invoice.bankAccount
            ? {
                bankSnapshot: {
                  label: invoice.bankAccount.label,
                  bankName: invoice.bankAccount.bankName ?? "",
                  accountNumber: invoice.bankAccount.accountNumber ?? "",
                  iban: invoice.bankAccount.iban ?? "",
                  swiftBic: invoice.bankAccount.swiftBic ?? "",
                  currency: invoice.bankAccount.currency,
                },
              }
            : {}),
          createdByUserId: actorUserId,
        },
        include: PAYMENT_DEMAND_INCLUDE,
      });

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "payment_demand.created",
          entityType: "PaymentDemand",
          entityId: row.id,
          metadata: {
            invoiceId,
            demandNumber,
            outstandingAmountMinor: derived.remainingMinor,
            countryCode: tenant.countryCode,
          },
        },
        tx,
      );

      return row;
    });

    return toDetailView(created);
  }

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
}

function toDetailView(row: PaymentDemandWithRelations): PaymentDemandDetailView {
  return {
    id: row.id,
    tenantId: row.tenantId,
    customerId: row.customerId,
    invoiceId: row.invoiceId,
    demandNumber: row.demandNumber,
    status: row.status,
    countryCode: row.countryCode,
    documentLanguage: row.documentLanguage,
    issueDate: row.issueDate.toISOString(),
    originalDueDate: row.originalDueDate?.toISOString() ?? null,
    requestedDeadline: row.requestedDeadline.toISOString(),
    currency: row.currency,
    originalAmountMinor: row.originalAmountMinor,
    paidAmountMinor: row.paidAmountMinor,
    outstandingAmountMinor: row.outstandingAmountMinor,
    creditorSnapshot: row.creditorSnapshot as Record<string, unknown>,
    debtorSnapshot: row.debtorSnapshot as Record<string, unknown>,
    bankSnapshot: (row.bankSnapshot as Record<string, unknown> | null) ?? null,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    invoice: row.invoice,
    customer: row.customer,
  };
}
