import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { InvoiceStatus, Payment, Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type { RecordPaymentDto } from "./dto/record-payment.dto";

/** Invoice statuses a Payment may be recorded against — never DRAFT (nothing has been issued yet) or a terminal void/replace state. */
const PAYABLE_STATUSES: InvoiceStatus[] = ["ISSUED", "SENT", "PARTIALLY_PAID", "OVERDUE", "PAID"];

/**
 * Minimal payment-tracking domain (see docs/DECISIONS.md). Recording a
 * Payment is the ONLY thing that ever moves an Invoice into
 * PARTIALLY_PAID/PAID — an Invoice's payment status is always derived
 * live from the sum of its Payment rows here, never inferred merely
 * because the Invoice was created or issued.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findMany(tenantId: string, invoiceId: string): Promise<Payment[]> {
    await this.assertInvoiceExists(tenantId, invoiceId);
    return this.prisma.payment.findMany({
      where: { tenantId, invoiceId },
      orderBy: { paymentDate: "desc" },
    });
  }

  async record(
    tenantId: string,
    invoiceId: string,
    actorUserId: string,
    dto: RecordPaymentDto,
  ): Promise<Payment> {
    const invoice = await this.assertInvoiceExists(tenantId, invoiceId);
    if (!PAYABLE_STATUSES.includes(invoice.status)) {
      throw new ConflictException(
        `Cannot record a payment against an invoice with status ${invoice.status}`,
      );
    }
    if (dto.amountMinor === 0) {
      throw new BadRequestException("amountMinor must not be zero");
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          tenantId,
          invoiceId,
          amountMinor: dto.amountMinor,
          currency: dto.currency ?? invoice.currency,
          paymentDate: new Date(dto.paymentDate),
          method: dto.method ?? "BANK_TRANSFER",
          reference: dto.reference ?? null,
          notes: dto.notes ?? null,
          createdByUserId: actorUserId,
        },
      });

      await this.recalculateInvoiceStatus(tx, tenantId, invoiceId, actorUserId);

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "payment.recorded",
          entityType: "Payment",
          entityId: created.id,
          metadata: { invoiceId, amountMinor: dto.amountMinor },
        },
        tx,
      );

      return created;
    });

    return payment;
  }

  /**
   * Recomputes and persists PARTIALLY_PAID/PAID from the live sum of an
   * invoice's Payment rows — never touches DRAFT/CANCELLED/CORRECTED, and
   * never moves a fully-paid invoice back to ISSUED/SENT/OVERDUE just
   * because a correction entry temporarily changes the running total below
   * zero net paid (floored at UNPAID-equivalent, i.e. whatever status the
   * invoice already had before payment tracking began is never resurrected
   * automatically — a negative correction taking PAID back below full
   * payment moves it to PARTIALLY_PAID, matching what the numbers now say).
   */
  private async recalculateInvoiceStatus(
    tx: Prisma.TransactionClient,
    tenantId: string,
    invoiceId: string,
    actorUserId: string | null,
  ): Promise<void> {
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (
      invoice.status === "DRAFT" ||
      invoice.status === "CANCELLED" ||
      invoice.status === "CORRECTED"
    ) {
      return;
    }

    const sum = await tx.payment.aggregate({
      where: { tenantId, invoiceId },
      _sum: { amountMinor: true },
    });
    const paidMinor = sum._sum.amountMinor ?? 0;

    const nextStatus: InvoiceStatus =
      paidMinor >= invoice.totalMinor && invoice.totalMinor > 0
        ? "PAID"
        : paidMinor > 0
          ? "PARTIALLY_PAID"
          : invoice.status === "PAID" || invoice.status === "PARTIALLY_PAID"
            ? "ISSUED"
            : invoice.status;

    if (nextStatus === invoice.status) {
      return;
    }

    await tx.invoice.update({ where: { id: invoiceId }, data: { status: nextStatus } });
    await tx.invoiceStatusHistory.create({
      data: {
        tenantId,
        invoiceId,
        fromStatus: invoice.status,
        toStatus: nextStatus,
        changedByUserId: actorUserId,
        reason: "Derived from recorded payments",
      },
    });
  }

  private async assertInvoiceExists(tenantId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { tenantId, id: invoiceId, deletedAt: null },
    });
    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }
    return invoice;
  }
}
