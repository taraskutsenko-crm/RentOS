import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

export interface PartnerAnalytics {
  registrations: number;
  /** Every Havelio registration starts a trial (see SubscriptionsService.startTrial), so this always equals `registrations` in V1 — reported separately to match the funnel the task describes, not because the two can differ today. */
  trialsStarted: number;
  paidConversions: number;
  activeSubscribers: number;
  cancellations: number;
  /** Never combined across currencies (see docs/DECISIONS.md "never a fake combined amount") — one entry per currency actually seen. */
  byCurrency: Record<
    string,
    { eligibleRevenueMinor: number; commissionEarnedMinor: number; commissionPaidMinor: number; commissionPayableMinor: number }
  >;
}

/** Havelio Affiliate/Partner domain (Stage 17) — Platform Admin funnel/revenue metrics per partner. */
@Injectable()
export class AffiliateAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPartnerAnalytics(partnerId: string): Promise<PartnerAnalytics> {
    const attributions = await this.prisma.affiliateAttribution.findMany({ where: { partnerId } });
    const tenantIds = attributions.map((a) => a.tenantId);

    const subscriptions = tenantIds.length
      ? await this.prisma.havelioSubscription.findMany({ where: { tenantId: { in: tenantIds } } })
      : [];
    const activeSubscribers = subscriptions.filter((s) => s.status === "ACTIVE" || s.status === "PAST_DUE").length;
    const cancellations = subscriptions.filter((s) => s.status === "CANCELED").length;

    const commissionEntries = await this.prisma.affiliateCommissionEntry.findMany({
      where: { partnerId },
    });
    const paidConversions = new Set(
      commissionEntries.filter((e) => e.eventType === "COMMISSION_EARNED" && e.tenantId).map((e) => e.tenantId),
    ).size;

    const byCurrency: PartnerAnalytics["byCurrency"] = {};
    for (const entry of commissionEntries) {
      const bucket = (byCurrency[entry.currency] ??= {
        eligibleRevenueMinor: 0,
        commissionEarnedMinor: 0,
        commissionPaidMinor: 0,
        commissionPayableMinor: 0,
      });
      if (entry.eventType === "COMMISSION_EARNED") {
        bucket.eligibleRevenueMinor += entry.eligibleRevenueMinor;
      }
      if (entry.eventType === "COMMISSION_EARNED" || entry.eventType === "COMMISSION_REVERSED" || entry.eventType === "MANUAL_ADJUSTMENT") {
        bucket.commissionEarnedMinor += entry.amountMinor;
      }
      if (entry.eventType === "PAYOUT") {
        bucket.commissionPaidMinor += -entry.amountMinor;
      }
    }
    for (const bucket of Object.values(byCurrency)) {
      bucket.commissionPayableMinor = bucket.commissionEarnedMinor - bucket.commissionPaidMinor;
    }

    return {
      registrations: attributions.length,
      trialsStarted: attributions.length,
      paidConversions,
      activeSubscribers,
      cancellations,
      byCurrency,
    };
  }
}
