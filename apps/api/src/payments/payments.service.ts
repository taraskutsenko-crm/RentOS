import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { InvoiceStatus, Payment, Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type { ApplyDepositDto } from "./dto/apply-deposit.dto";
import type { MarkFullyPaidDto } from "./dto/mark-fully-paid.dto";
import type { RecordPaymentDto } from "./dto/record-payment.dto";
import type { VoidPaymentDto } from "./dto/void-payment.dto";

/** Invoice statuses a Payment may be recorded against — never DRAFT (nothing has been issued yet) or a terminal void/replace state. */
const PAYABLE_STATUSES: InvoiceStatus[] = ["ISSUED", "SENT", "PARTIALLY_PAID", "OVERDUE", "PAID"];

/**
 * Minimal payment-tracking domain (see docs/DECISIONS.md). Recording a
 * Payment is the ONLY thing that ever moves an Invoice into
 * PARTIALLY_PAID/PAID — an Invoice's payment status is always derived
 * live from the sum of its non-voided Payment rows here, never inferred
 * merely because the Invoice was created or issued.
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
    if (dto.amountMinor === 0) {
      throw new BadRequestException("amountMinor must not be zero");
    }

    return this.prisma.$transaction(async (tx) => {
      // Row-locked for the duration of this transaction — see markFullyPaid's
      // doc comment for why this matters for concurrent requests; a plain
      // `record()` call benefits from the same protection against two
      // near-simultaneous payments jointly overpaying an invoice.
      const invoice = await this.lockInvoiceForUpdate(tx, tenantId, invoiceId);
      if (!PAYABLE_STATUSES.includes(invoice.status)) {
        throw new ConflictException(
          `Cannot record a payment against an invoice with status ${invoice.status}`,
        );
      }

      const currency = dto.currency ?? invoice.currency;
      // Havelio is international — a receivable's currency is never mixed
      // with a payment in a different one, and there is no automatic FX
      // conversion (see docs/PRODUCT_BIBLE.md, docs/DECISIONS.md).
      if (currency !== invoice.currency) {
        throw new BadRequestException(
          `Payment currency (${currency}) must match the invoice's currency (${invoice.currency}) — Havelio never mixes currencies or auto-converts`,
        );
      }

      if (dto.amountMinor > 0) {
        const paidMinor = await this.sumNonVoidedPayments(tx, tenantId, invoiceId);
        const remainingMinor = Math.max(0, invoice.totalMinor - paidMinor);
        if (dto.amountMinor > remainingMinor) {
          throw new BadRequestException(
            `Payment of ${dto.amountMinor} exceeds the remaining balance of ${remainingMinor} — Havelio does not allow overpayment`,
          );
        }
      }

      const created = await tx.payment.create({
        data: {
          tenantId,
          invoiceId,
          amountMinor: dto.amountMinor,
          currency,
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
          action: "payment.created",
          entityType: "Payment",
          entityId: created.id,
          metadata: { invoiceId, amountMinor: dto.amountMinor },
        },
        tx,
      );

      return created;
    });
  }

  /**
   * One-click full payment ("Mark as paid" — Havelio Payments &
   * Receivables). The frontend never supplies an amount: the exact
   * remaining balance is computed here, inside the same transaction that
   * locks the invoice row (`SELECT ... FOR UPDATE`) and creates the
   * Payment — so two near-simultaneous "Mark as paid" clicks (or any
   * concurrent duplicate request) can never both succeed for the full
   * remaining amount. The second request re-reads the balance AFTER the
   * first has committed and its own lock is granted, sees `remainingMinor
   * === 0`, and is rejected with a clear conflict rather than silently
   * creating a second, now-overpaying entry.
   */
  async markFullyPaid(
    tenantId: string,
    invoiceId: string,
    actorUserId: string,
    dto: MarkFullyPaidDto,
  ): Promise<Payment> {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await this.lockInvoiceForUpdate(tx, tenantId, invoiceId);
      if (!PAYABLE_STATUSES.includes(invoice.status)) {
        throw new ConflictException(
          `Cannot record a payment against an invoice with status ${invoice.status}`,
        );
      }

      const paidMinor = await this.sumNonVoidedPayments(tx, tenantId, invoiceId);
      const remainingMinor = Math.max(0, invoice.totalMinor - paidMinor);
      if (remainingMinor <= 0) {
        throw new ConflictException("This invoice is already fully paid");
      }

      const created = await tx.payment.create({
        data: {
          tenantId,
          invoiceId,
          amountMinor: remainingMinor,
          currency: invoice.currency,
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
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
          action: "payment.full_balance_marked_paid",
          entityType: "Payment",
          entityId: created.id,
          metadata: { invoiceId, amountMinor: remainingMinor },
        },
        tx,
      );

      return created;
    });
  }

  /**
   * Voids a mistaken Payment — never a hard delete (see Payment's schema
   * doc comment). The row and its original amount/date/method remain
   * exactly as recorded, permanently, with `voidedAt`/`voidedByUserId`/
   * `voidReason` layered on top; every paid-total calculation (here and in
   * InvoicesService) excludes a voided row from that point on.
   */
  async void(
    tenantId: string,
    invoiceId: string,
    paymentId: string,
    actorUserId: string,
    dto: VoidPaymentDto,
  ): Promise<Payment> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockInvoiceForUpdate(tx, tenantId, invoiceId);

      const payment = await tx.payment.findFirst({ where: { id: paymentId, tenantId, invoiceId } });
      if (!payment) {
        throw new NotFoundException("Payment not found");
      }
      if (payment.voidedAt) {
        throw new ConflictException("This payment has already been voided");
      }

      const voided = await tx.payment.update({
        where: { id: paymentId },
        data: { voidedAt: new Date(), voidedByUserId: actorUserId, voidReason: dto.reason },
      });

      await this.recalculateInvoiceStatus(tx, tenantId, invoiceId, actorUserId);

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "payment.voided",
          entityType: "Payment",
          entityId: paymentId,
          metadata: { invoiceId, amountMinor: payment.amountMinor, reason: dto.reason },
        },
        tx,
      );

      return voided;
    });
  }

  /**
   * "Apply deposit to balance" (Havelio Payments & Receivables, Phase 10)
   * — an explicit financial event, never automatic (see
   * docs/PRODUCT_BIBLE.md). Reallocates part of an already-held
   * RentalDeposit into a real Payment against a specific Invoice, so the
   * invoice's derived paid/remaining totals are correct without a held
   * deposit ever being silently counted as rental revenue on its own (see
   * RentalDepositsService's own doc comment on why a deposit is a
   * balance-sheet liability, not revenue). The Payment row created here is
   * indistinguishable in kind from any other (same append-only ledger,
   * same currency/overpayment rules) except for `sourceRentalDepositId`,
   * which records where the money actually came from for audit purposes.
   */
  async applyDeposit(
    tenantId: string,
    invoiceId: string,
    actorUserId: string,
    dto: ApplyDepositDto,
  ): Promise<Payment> {
    if (dto.amountMinor <= 0) {
      throw new BadRequestException("amountMinor must be positive");
    }

    return this.prisma.$transaction(async (tx) => {
      const invoice = await this.lockInvoiceForUpdate(tx, tenantId, invoiceId);
      if (!PAYABLE_STATUSES.includes(invoice.status)) {
        throw new ConflictException(
          `Cannot apply a deposit against an invoice with status ${invoice.status}`,
        );
      }

      const deposit = await tx.rentalDeposit.findFirst({
        where: { id: dto.rentalDepositId, tenantId },
      });
      if (!deposit) {
        throw new NotFoundException("Rental deposit not found");
      }
      if (!deposit.receivedAt || deposit.receivedAmountMinor === null) {
        throw new ConflictException("No deposit has been received yet for this rental");
      }
      if (deposit.currency !== invoice.currency) {
        throw new BadRequestException(
          `Deposit currency (${deposit.currency}) must match the invoice's currency (${invoice.currency})`,
        );
      }

      // How much of the received deposit is still available: received
      // minus whatever has already been applied to any invoice, returned,
      // or retained — the live sum of Payment rows tagged with this
      // deposit is the authoritative "already applied" figure, never a
      // separately stored running total (matches every other derived
      // total in this codebase).
      const alreadyApplied = await tx.payment.aggregate({
        where: { tenantId, sourceRentalDepositId: deposit.id, voidedAt: null },
        _sum: { amountMinor: true },
      });
      const appliedSoFar = alreadyApplied._sum.amountMinor ?? 0;
      const returnedOrRetained =
        (deposit.returnedAmountMinor ?? 0) + (deposit.retainedAmountMinor ?? 0);
      const availableMinor = deposit.receivedAmountMinor - appliedSoFar - returnedOrRetained;
      if (dto.amountMinor > availableMinor) {
        throw new BadRequestException(
          `Requested amount (${dto.amountMinor}) exceeds the available held deposit balance (${availableMinor})`,
        );
      }

      const paidMinor = await this.sumNonVoidedPayments(tx, tenantId, invoiceId);
      const remainingMinor = Math.max(0, invoice.totalMinor - paidMinor);
      if (dto.amountMinor > remainingMinor) {
        throw new BadRequestException(
          `Requested amount (${dto.amountMinor}) exceeds the invoice's remaining balance (${remainingMinor})`,
        );
      }

      const created = await tx.payment.create({
        data: {
          tenantId,
          invoiceId,
          amountMinor: dto.amountMinor,
          currency: invoice.currency,
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
          method: deposit.receivedMethod ?? "OTHER",
          reference: `Deposit application (${deposit.id})`,
          sourceRentalDepositId: deposit.id,
          createdByUserId: actorUserId,
        },
      });

      await this.recalculateInvoiceStatus(tx, tenantId, invoiceId, actorUserId);

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "deposit.applied_to_receivable",
          entityType: "Payment",
          entityId: created.id,
          metadata: {
            invoiceId,
            rentalDepositId: deposit.id,
            amountMinor: dto.amountMinor,
          },
        },
        tx,
      );

      return created;
    });
  }

  /**
   * Locks the Invoice row for the duration of the enclosing transaction
   * (`SELECT ... FOR UPDATE`) — the concurrency-safety primitive every
   * money-moving method above shares. A second concurrent call against the
   * same invoice simply waits for the first transaction to commit, then
   * re-reads the now-current state; it can never act on a stale balance.
   */
  private async lockInvoiceForUpdate(
    tx: Prisma.TransactionClient,
    tenantId: string,
    invoiceId: string,
  ): Promise<{ id: string; tenantId: string; status: InvoiceStatus; totalMinor: number; currency: string }> {
    const rows = await tx.$queryRaw<
      { id: string; tenantId: string; status: InvoiceStatus; totalMinor: number; currency: string }[]
    >`SELECT id, "tenantId", status, "totalMinor", currency FROM invoices WHERE id = ${invoiceId} AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL FOR UPDATE`;
    const invoice = rows[0];
    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }
    return invoice;
  }

  private async sumNonVoidedPayments(
    tx: Prisma.TransactionClient,
    tenantId: string,
    invoiceId: string,
  ): Promise<number> {
    const sum = await tx.payment.aggregate({
      where: { tenantId, invoiceId, voidedAt: null },
      _sum: { amountMinor: true },
    });
    return sum._sum.amountMinor ?? 0;
  }

  /**
   * Recomputes and persists PARTIALLY_PAID/PAID from the live sum of an
   * invoice's non-voided Payment rows — never touches DRAFT/CANCELLED/
   * CORRECTED, and never moves a fully-paid invoice back to
   * ISSUED/SENT/OVERDUE just because a correction/void temporarily changes
   * the running total below zero net paid (floored at UNPAID-equivalent, a
   * negative correction taking PAID back below full payment moves it to
   * PARTIALLY_PAID, matching what the numbers now say).
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

    const paidMinor = await this.sumNonVoidedPayments(tx, tenantId, invoiceId);

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
