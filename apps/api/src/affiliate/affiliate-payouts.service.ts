import { BadRequestException, Injectable } from "@nestjs/common";
import type { AffiliatePayout, AffiliatePayoutMethod } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { AffiliateCommissionService } from "./affiliate-commission.service";

/**
 * Havelio Affiliate/Partner domain (Stage 17) — Stage 17 V1 payouts are
 * always a MANUAL RECORD of money the platform admin already sent the
 * partner OUTSIDE Havelio (bank transfer/PayPal/other) — see
 * docs/DECISIONS.md "affiliate payouts V1". No Stripe Connect, no
 * automated transfer; recording one here never itself moves money.
 */
@Injectable()
export class AffiliatePayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly commissionService: AffiliateCommissionService,
  ) {}

  async recordPayout(
    partnerId: string,
    amountMinor: number,
    currency: string,
    payoutDate: Date,
    method: AffiliatePayoutMethod,
    actorUserId: string,
    reference?: string,
    note?: string,
  ): Promise<AffiliatePayout> {
    if (amountMinor <= 0) {
      throw new BadRequestException("Payout amount must be positive.");
    }

    const payout = await this.prisma.$transaction(async (tx) => {
      const created = await tx.affiliatePayout.create({
        data: {
          partnerId,
          amountMinor,
          currency: currency.toUpperCase(),
          payoutDate,
          method,
          reference: reference ?? null,
          note: note ?? null,
          recordedByUserId: actorUserId,
        },
      });
      await tx.affiliateCommissionEntry.create({
        data: {
          partnerId,
          eventType: "PAYOUT",
          currency: currency.toUpperCase(),
          amountMinor: -amountMinor,
          payoutId: created.id,
          note: note ?? `Manual payout recorded by platform admin (${method}).`,
        },
      });
      return created;
    });

    await this.auditService.log({
      userId: actorUserId,
      action: "billing.affiliate_payout.recorded",
      entityType: "AffiliatePayout",
      entityId: payout.id,
      metadata: { partnerId, amountMinor, currency, method, reference: reference ?? null },
    });

    return payout;
  }

  async listForPartner(partnerId: string): Promise<AffiliatePayout[]> {
    return this.prisma.affiliatePayout.findMany({
      where: { partnerId },
      orderBy: { payoutDate: "desc" },
    });
  }

  /** Earned / Adjustments / Paid / Payable summary for one partner, in one currency at a time (see docs/DECISIONS.md "never a fake combined amount"). */
  async getPayableSummary(partnerId: string, currency: string): Promise<{
    earnedMinor: number;
    adjustmentsMinor: number;
    paidMinor: number;
    payableMinor: number;
  }> {
    const entries = await this.prisma.affiliateCommissionEntry.findMany({
      where: { partnerId, currency: currency.toUpperCase() },
    });

    let earnedMinor = 0;
    let adjustmentsMinor = 0;
    let paidMinor = 0;
    for (const entry of entries) {
      switch (entry.eventType) {
        case "COMMISSION_EARNED":
        case "COMMISSION_REVERSED":
          earnedMinor += entry.amountMinor;
          break;
        case "MANUAL_ADJUSTMENT":
          adjustmentsMinor += entry.amountMinor;
          break;
        case "PAYOUT":
          paidMinor += -entry.amountMinor;
          break;
      }
    }

    return { earnedMinor, adjustmentsMinor, paidMinor, payableMinor: earnedMinor + adjustmentsMinor - paidMinor };
  }
}
