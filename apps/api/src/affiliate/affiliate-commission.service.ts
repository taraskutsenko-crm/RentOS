import { Injectable, Logger } from "@nestjs/common";
import type { AffiliateCommissionEntry } from "@prisma/client";
import type Stripe from "stripe";

import { AuditService } from "../audit/audit.service";
import type { IAffiliateInvoiceEventHandler } from "../billing/affiliate-invoice-event-handler.types";
import { extractChargeInvoiceId, extractInvoiceSubscriptionId } from "../billing/stripe-subscription.util";
import { SubscriptionsService } from "../billing/subscriptions.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Havelio Affiliate/Partner domain (Stage 17) — the auditable commission
 * ledger (AffiliateCommissionEntry). Money math here is always integer
 * minor units and always basis points — never a float (see
 * docs/DECISIONS.md).
 *
 * V1 commission base (documented decision, see docs/DECISIONS.md "tax/
 * Stripe fees/commission base"): `invoice.total_excluding_tax` — Stripe's
 * own "total amount of the invoice including all discounts but excluding
 * all tax" figure. This is the real, discount-applied, pre-tax amount
 * Havelio actually earned from this invoice; falls back to `amount_paid`
 * on the rare invoice where Stripe omits `total_excluding_tax`. Stripe's
 * own processing fees are NOT subtracted (V1 decision — commission is
 * computed on gross collected-and-taxable-excluded revenue, matching the
 * task's own worked example of 25% x €55.20 with no fee deduction
 * mentioned).
 *
 * Idempotency: `@@unique([stripeInvoiceId, eventType])` on
 * AffiliateCommissionEntry is the actual database-level guarantee — a
 * duplicate `invoice.paid` (or `charge.refunded`) webhook for the same
 * invoice can insert at most one COMMISSION_EARNED (resp.
 * COMMISSION_REVERSED) row; the second attempt is caught here and treated
 * as already-processed. See affiliate-commission.service.spec.ts.
 */
@Injectable()
export class AffiliateCommissionService implements IAffiliateInvoiceEventHandler {
  private readonly logger = new Logger(AffiliateCommissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly auditService: AuditService,
  ) {}

  async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = extractInvoiceSubscriptionId(invoice);
    if (!subscriptionId) return;

    const tenantId = await this.subscriptionsService.findTenantIdForSubscription(subscriptionId);
    if (!tenantId) return;

    const attribution = await this.prisma.affiliateAttribution.findUnique({ where: { tenantId } });
    if (!attribution || !attribution.campaignId) return;

    const campaign = await this.prisma.affiliateCampaign.findUnique({
      where: { id: attribution.campaignId },
    });
    if (!campaign) return;

    const eligibleRevenueMinor = invoice.total_excluding_tax ?? invoice.amount_paid;
    if (eligibleRevenueMinor <= 0) return;

    if (!(await this.isWithinEligibilityWindow(tenantId, campaign.commissionDurationMonths))) {
      this.logger.debug(`Invoice ${invoice.id} for tenant ${tenantId} is outside the commission eligibility window.`);
      return;
    }

    const commissionAmountMinor = Math.round((eligibleRevenueMinor * campaign.commissionRateBp) / 10000);
    if (commissionAmountMinor <= 0) return;

    try {
      const entry = await this.prisma.affiliateCommissionEntry.create({
        data: {
          partnerId: attribution.partnerId,
          tenantId,
          campaignId: campaign.id,
          eventType: "COMMISSION_EARNED",
          stripeInvoiceId: invoice.id,
          currency: invoice.currency.toUpperCase(),
          eligibleRevenueMinor,
          commissionRateBp: campaign.commissionRateBp,
          amountMinor: commissionAmountMinor,
        },
      });
      // AuditLog is observational metadata only — the ledger entry above
      // (already committed, unique-constrained on stripeInvoiceId+eventType)
      // is the canonical financial record; this never duplicates or
      // re-derives its effect, and a duplicate webhook that hits the
      // catch branch below never reaches this line, so at most one
      // "commission earned" audit event exists per invoice (see
      // docs/DECISIONS.md).
      await this.auditService.log({
        tenantId,
        action: "billing.affiliate_commission.earned",
        entityType: "AffiliateCommissionEntry",
        entityId: entry.id,
        metadata: {
          partnerId: attribution.partnerId,
          campaignId: campaign.id,
          stripeInvoiceId: invoice.id,
          currency: entry.currency,
          amountMinor: commissionAmountMinor,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      this.logger.debug(`Commission for invoice ${invoice.id} already recorded — skipping duplicate.`);
    }
  }

  /**
   * "First 12 months after first paid conversion" (see
   * AffiliateCampaign.commissionDurationMonths's own doc comment) — the
   * anchor is the earliest COMMISSION_EARNED entry this tenant has ever
   * had, or "now" when this would be the first one (making the current
   * invoice its own anchor).
   */
  private async isWithinEligibilityWindow(tenantId: string, durationMonths: number): Promise<boolean> {
    const earliest = await this.prisma.affiliateCommissionEntry.findFirst({
      where: { tenantId, eventType: "COMMISSION_EARNED" },
      orderBy: { earnedAt: "asc" },
    });
    if (!earliest) return true;

    const eligibleUntil = new Date(earliest.earnedAt);
    eligibleUntil.setMonth(eligibleUntil.getMonth() + durationMonths);
    return Date.now() <= eligibleUntil.getTime();
  }

  async handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
    const invoiceId = extractChargeInvoiceId(charge);
    if (!invoiceId) return;

    const original = await this.prisma.affiliateCommissionEntry.findFirst({
      where: { stripeInvoiceId: invoiceId, eventType: "COMMISSION_EARNED" },
    });
    if (!original) return;

    try {
      const reversal = await this.prisma.affiliateCommissionEntry.create({
        data: {
          partnerId: original.partnerId,
          tenantId: original.tenantId,
          campaignId: original.campaignId,
          eventType: "COMMISSION_REVERSED",
          stripeInvoiceId: original.stripeInvoiceId,
          currency: original.currency,
          eligibleRevenueMinor: 0,
          commissionRateBp: original.commissionRateBp,
          amountMinor: -original.amountMinor,
          reversesEntryId: original.id,
          note: `Reversal for refunded invoice ${invoiceId}`,
        },
      });
      // Same idempotency guarantee as the "earned" audit event above — the
      // unique constraint on (stripeInvoiceId, eventType) means at most one
      // COMMISSION_REVERSED row (and therefore at most one audit event) can
      // ever exist per invoice.
      await this.auditService.log({
        tenantId: original.tenantId,
        action: "billing.affiliate_commission.reversed",
        entityType: "AffiliateCommissionEntry",
        entityId: reversal.id,
        metadata: {
          partnerId: original.partnerId,
          reversesEntryId: original.id,
          stripeInvoiceId: invoiceId,
          currency: original.currency,
          amountMinor: -original.amountMinor,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      this.logger.debug(`Reversal for invoice ${invoiceId} already recorded — skipping duplicate.`);
    }
  }

  /** Platform-admin manual correction — see docs/DECISIONS.md "refunds/reversals/chargebacks" and the payouts service, which also creates rows here (eventType=PAYOUT). */
  async recordManualAdjustment(
    partnerId: string,
    amountMinor: number,
    currency: string,
    note: string,
    tenantId?: string,
  ): Promise<AffiliateCommissionEntry> {
    return this.prisma.affiliateCommissionEntry.create({
      data: {
        partnerId,
        tenantId: tenantId ?? null,
        eventType: "MANUAL_ADJUSTMENT",
        currency: currency.toUpperCase(),
        amountMinor,
        note,
      },
    });
  }

  /** Live sum of every ledger entry for a partner, grouped by currency (see docs/DECISIONS.md "never a fake combined amount"). */
  async getPartnerBalances(partnerId: string): Promise<Record<string, number>> {
    const entries = await this.prisma.affiliateCommissionEntry.groupBy({
      by: ["currency"],
      where: { partnerId },
      _sum: { amountMinor: true },
    });
    const balances: Record<string, number> = {};
    for (const entry of entries) {
      balances[entry.currency] = entry._sum.amountMinor ?? 0;
    }
    return balances;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}
