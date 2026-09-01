import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, RentalDeposit } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type { RecordDepositReceiptDto } from "./dto/record-deposit-receipt.dto";
import type { RecordDepositReturnDto } from "./dto/record-deposit-return.dto";

/** The minimal query surface `getBalance`/`computeBalance` need — satisfied by both `PrismaService` and a `Prisma.TransactionClient`, so the same canonical calculation runs identically whether called standalone or from inside another service's own transaction (see PaymentsService.applyDeposit). */
type DepositQueryClient = Pick<PrismaService, "rentalDeposit" | "payment"> | Prisma.TransactionClient;

/**
 * Havelio Payments & Receivables — the canonical, single-source-of-truth
 * "how much of this held deposit is still available to apply to a
 * receivable" figure (docs/PRODUCT_BIBLE.md, docs/DECISIONS.md). Every
 * consumer — this service's own `recordReturn` validation, `PaymentsService
 * .applyDeposit`'s validation, and the `GET .../deposit` response the
 * frontend renders — calls `getBalance`/`computeBalance`; none of them
 * ever recomputes the formula independently.
 */
export interface DepositBalance {
  currency: string;
  receivedMinor: number;
  returnedMinor: number;
  retainedMinor: number;
  /** Live sum of non-voided Payment rows tagged with this deposit (see Payment.sourceRentalDepositId) — never a separately stored running total, so voiding a deposit-sourced payment automatically restores availability. */
  appliedMinor: number;
  /** max(0, received − returned − retained − applied) — never negative, see `computeBalance`'s own doc comment for what a negative raw value would mean. */
  availableMinor: number;
}

/**
 * The accounting side of a Rental's security deposit — see RentalDeposit in
 * schema.prisma. Deliberately separate from RentalItem.depositMinor (the
 * *required* amount quoted/priced per item, unchanged, still shown as
 * "Amount due at start" — see docs/DECISIONS.md D-097/D-098). A refundable
 * deposit is a balance-sheet liability while held, not taxable rental
 * revenue; only a retained amount becomes a real charge, and that must be
 * added to the rental's Invoice as its own line by staff (see
 * InvoiceItemDto's free-text `description` — no automatic invoice creation
 * here, to avoid guessing which invoice/period a retained amount belongs on).
 */
@Injectable()
export class RentalDepositsService {
  private readonly logger = new Logger(RentalDepositsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findForRental(tenantId: string, rentalId: string) {
    await this.assertRentalExists(tenantId, rentalId);
    const deposit = await this.prisma.rentalDeposit.findUnique({ where: { rentalId } });
    if (!deposit) return null;
    const balance = await this.computeBalance(tenantId, deposit, this.prisma);
    return { ...deposit, balance };
  }

  /**
   * Canonical available-balance lookup by deposit id — used by
   * PaymentsService.applyDeposit (passing its own transaction client `tx`
   * so the read is part of the same locked, consistent transaction as the
   * write it validates). Returns `null` for a deposit that was never
   * actually received yet (nothing to apply).
   */
  async getBalance(
    tenantId: string,
    depositId: string,
    client: DepositQueryClient = this.prisma,
  ): Promise<DepositBalance | null> {
    const deposit = await client.rentalDeposit.findFirst({ where: { id: depositId, tenantId } });
    if (!deposit) return null;
    return this.computeBalance(tenantId, deposit, client);
  }

  /**
   * Pure(ish) computation from an already-loaded RentalDeposit row plus a
   * live query for how much has already been applied. `availableMinor` is
   * clamped at 0 and never negative in the returned value — a raw negative
   * result (received − returned − retained − applied < 0) can only happen
   * from inconsistent historical data (e.g. a deposit returned/retained in
   * full before this canonical check existed, while some of it was also
   * separately applied), never from a normal flow through this service's
   * own validated actions. That case is logged as an error (an invariant
   * violation worth investigating) rather than silently hidden, but the
   * user-facing value is still clamped — Havelio never displays or allows
   * spending a negative deposit balance.
   */
  private async computeBalance(
    tenantId: string,
    deposit: RentalDeposit,
    client: DepositQueryClient,
  ): Promise<DepositBalance | null> {
    if (!deposit.receivedAt || deposit.receivedAmountMinor === null) return null;

    const appliedResult = await client.payment.aggregate({
      where: { tenantId, sourceRentalDepositId: deposit.id, voidedAt: null },
      _sum: { amountMinor: true },
    });
    const appliedMinor = appliedResult._sum.amountMinor ?? 0;
    const receivedMinor = deposit.receivedAmountMinor;
    const returnedMinor = deposit.returnedAmountMinor ?? 0;
    const retainedMinor = deposit.retainedAmountMinor ?? 0;

    const rawAvailableMinor = receivedMinor - returnedMinor - retainedMinor - appliedMinor;
    if (rawAvailableMinor < 0) {
      this.logger.error(
        `RentalDeposit ${deposit.id} (tenant ${tenantId}, rental ${deposit.rentalId}) computed a negative available balance (${rawAvailableMinor} minor units): received=${receivedMinor} returned=${returnedMinor} retained=${retainedMinor} applied=${appliedMinor}. This indicates inconsistent historical deposit data — clamping the user-facing available balance to 0.`,
      );
    }

    return {
      currency: deposit.currency,
      receivedMinor,
      returnedMinor,
      retainedMinor,
      appliedMinor,
      availableMinor: Math.max(0, rawAvailableMinor),
    };
  }

  /**
   * Creates the RentalDeposit row on first receipt. The required amount is
   * always the live sum of RentalItem.depositMinor at this moment (never
   * client-supplied) — same "server always derives the authoritative
   * amount" rule as every other financial total in this codebase.
   */
  async recordReceipt(
    tenantId: string,
    rentalId: string,
    actorUserId: string,
    dto: RecordDepositReceiptDto,
  ) {
    const rental = await this.assertRentalExists(tenantId, rentalId);

    const existing = await this.prisma.rentalDeposit.findUnique({ where: { rentalId } });
    if (existing?.receivedAt) {
      throw new ConflictException(
        "A deposit receipt has already been recorded for this rental — cancel/correct it before recording a new one",
      );
    }

    const requiredAmount = await this.prisma.rentalItem.aggregate({
      where: { tenantId, rentalId },
      _sum: { depositMinor: true },
    });
    const requiredAmountMinor = requiredAmount._sum.depositMinor ?? 0;

    return this.prisma.$transaction(async (tx) => {
      const deposit = await tx.rentalDeposit.upsert({
        where: { rentalId },
        create: {
          tenantId,
          rentalId,
          requiredAmountMinor,
          currency: rental.currency,
          receivedAt: new Date(dto.receivedAt),
          receivedAmountMinor: dto.receivedAmountMinor,
          receivedMethod: dto.receivedMethod,
          receivedReference: dto.receivedReference ?? null,
          notes: dto.notes ?? null,
          createdByUserId: actorUserId,
        },
        update: {
          receivedAt: new Date(dto.receivedAt),
          receivedAmountMinor: dto.receivedAmountMinor,
          receivedMethod: dto.receivedMethod,
          receivedReference: dto.receivedReference ?? null,
          notes: dto.notes ?? null,
          updatedByUserId: actorUserId,
        },
      });
      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "rental_deposit.received",
          entityType: "RentalDeposit",
          entityId: deposit.id,
          metadata: { rentalId, receivedAmountMinor: dto.receivedAmountMinor },
        },
        tx,
      );
      return deposit;
    });
  }

  async recordReturn(
    tenantId: string,
    rentalId: string,
    actorUserId: string,
    dto: RecordDepositReturnDto,
  ) {
    await this.assertRentalExists(tenantId, rentalId);

    const existing = await this.prisma.rentalDeposit.findUnique({ where: { rentalId } });
    if (!existing || !existing.receivedAt) {
      throw new NotFoundException("No recorded deposit receipt exists for this rental yet");
    }
    if (existing.returnedAt) {
      throw new ConflictException("This deposit has already been returned/settled");
    }

    // A one-time action (guarded by `returnedAt` above, so returned/
    // retained are always still 0 at this point) — the canonical balance's
    // `availableMinor` here already accounts for any amount previously
    // applied to a receivable, not just the original received amount, so
    // staff can never return/retain money that was already spent (see
    // docs/DECISIONS.md — this closes a real gap the original
    // `receivedAmountMinor`-only check had).
    const balance = await this.computeBalance(tenantId, existing, this.prisma);
    const availableMinor = balance?.availableMinor ?? 0;
    if (dto.returnedAmountMinor + dto.retainedAmountMinor > availableMinor) {
      throw new BadRequestException(
        `Returned amount plus retained amount (${dto.returnedAmountMinor + dto.retainedAmountMinor}) cannot exceed the deposit's available balance (${availableMinor}) — part of this deposit has already been applied to a receivable`,
      );
    }
    if (dto.retainedAmountMinor > 0 && !dto.retentionReason) {
      throw new BadRequestException("A retention reason is required when retaining any amount");
    }

    return this.prisma.$transaction(async (tx) => {
      const deposit = await tx.rentalDeposit.update({
        where: { rentalId },
        data: {
          returnedAt: new Date(dto.returnedAt),
          returnedAmountMinor: dto.returnedAmountMinor,
          retainedAmountMinor: dto.retainedAmountMinor,
          retentionReason: dto.retentionReason ?? null,
          notes: dto.notes ?? existing.notes,
          updatedByUserId: actorUserId,
        },
      });
      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "rental_deposit.returned",
          entityType: "RentalDeposit",
          entityId: deposit.id,
          metadata: {
            rentalId,
            returnedAmountMinor: dto.returnedAmountMinor,
            retainedAmountMinor: dto.retainedAmountMinor,
          },
        },
        tx,
      );
      return deposit;
    });
  }

  private async assertRentalExists(tenantId: string, rentalId: string) {
    const rental = await this.prisma.rental.findFirst({
      where: { id: rentalId, tenantId, deletedAt: null },
      select: { id: true, currency: true },
    });
    if (!rental) {
      throw new NotFoundException("Rental not found");
    }
    return rental;
  }
}
