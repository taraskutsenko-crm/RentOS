import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type { RecordDepositReceiptDto } from "./dto/record-deposit-receipt.dto";
import type { RecordDepositReturnDto } from "./dto/record-deposit-return.dto";

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findForRental(tenantId: string, rentalId: string) {
    await this.assertRentalExists(tenantId, rentalId);
    return this.prisma.rentalDeposit.findUnique({ where: { rentalId } });
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

    const receivedAmountMinor = existing.receivedAmountMinor ?? 0;
    if (dto.returnedAmountMinor + dto.retainedAmountMinor > receivedAmountMinor) {
      throw new BadRequestException(
        "Returned amount plus retained amount cannot exceed the amount originally received",
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
