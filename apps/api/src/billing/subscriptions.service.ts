import { BadRequestException, ConflictException, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { HavelioPlan, HavelioSubscription, Prisma } from "@prisma/client";
import type { ApiEnv } from "@rentos/shared";
import type Stripe from "stripe";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { STRIPE_PROVIDER, type IStripeProvider } from "./billing.types";
import { getPlanDefinition, ORDERED_PLANS, TRIAL_DURATION_DAYS } from "./plan-config";
import { PromoCodesService } from "./promo-codes.service";
import { getPriceId, reversePriceLookup } from "./stripe-price-map";
import {
  extractCurrentPeriod,
  extractInvoiceSubscriptionId,
  extractPriceId,
} from "./stripe-subscription.util";

const PLAN_RANK: Record<Exclude<HavelioPlan, "ENTERPRISE">, number> = {
  STARTER: 1,
  BUSINESS: 2,
  PROFESSIONAL: 3,
};

/**
 * Havelio Billing (Stage 17) — the subscription lifecycle for money HAVELIO
 * receives from a tenant company (never RENTAL FINANCE — see this module's
 * header comment in schema.prisma). This is the ONE service that reads or
 * writes `HavelioSubscription`; controllers and other modules (entitlement
 * checks, the affiliate commission service) go through it or through
 * EntitlementsService, never through `prisma.havelioSubscription` directly.
 *
 * Two lazy state transitions happen here on every read (this codebase has
 * no job scheduler — see docs/DECISIONS.md), mirroring how availability/
 * expiry-style state is computed on read elsewhere in the codebase rather
 * than via a cron:
 *   1. TRIALING -> EXPIRED once `trialEndsAt` has passed.
 *   2. A scheduled DOWNGRADE is applied once `currentPeriodEnd` has passed.
 * Both are idempotent no-ops when there's nothing to do.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService<ApiEnv, true>,
    private readonly promoCodesService: PromoCodesService,
    @Inject(STRIPE_PROVIDER) private readonly stripeProvider: IStripeProvider,
  ) {}

  isStripeConfigured(): boolean {
    return this.stripeProvider.isConfigured();
  }

  /**
   * Creates the tenant's trial subscription — called once, inside the same
   * registration transaction as Tenant/User/Membership creation (see
   * AuthService.register). No Stripe involved: no card required, no
   * automatic charge. `plan: PROFESSIONAL` here represents "full-featured
   * evaluation access" (see docs/DECISIONS.md "trial grants top-tier
   * entitlements for full meaningful product evaluation") — it is
   * overwritten with whatever real plan the tenant actually buys the moment
   * a paid checkout completes; it is never itself billed.
   */
  async startTrial(tx: Prisma.TransactionClient, tenantId: string): Promise<HavelioSubscription> {
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);

    const subscription = await tx.havelioSubscription.create({
      data: {
        tenantId,
        plan: "PROFESSIONAL",
        status: "TRIALING",
        trialStartedAt: now,
        trialEndsAt,
      },
    });

    await this.auditService.log(
      {
        tenantId,
        action: "billing.trial.started",
        entityType: "HavelioSubscription",
        entityId: subscription.id,
        metadata: { trialEndsAt: trialEndsAt.toISOString() },
      },
      tx,
    );

    return subscription;
  }

  /**
   * Reads the tenant's subscription, applying both lazy transitions above.
   * Every other method in this service and EntitlementsService must go
   * through this rather than a raw `findUnique`, so state is never stale.
   */
  async getSubscription(tenantId: string): Promise<HavelioSubscription> {
    let subscription = await this.prisma.havelioSubscription.findUnique({ where: { tenantId } });
    if (!subscription) {
      throw new ConflictException(
        `Tenant ${tenantId} has no HavelioSubscription row — see the Stage 17 migration/backfill for pre-existing tenants.`,
      );
    }

    subscription = await this.applyTrialExpiryIfDue(subscription);
    subscription = await this.applyScheduledDowngradeIfDue(subscription);
    return subscription;
  }

  private async applyTrialExpiryIfDue(subscription: HavelioSubscription): Promise<HavelioSubscription> {
    if (subscription.status !== "TRIALING" || !subscription.trialEndsAt) return subscription;
    if (subscription.trialEndsAt.getTime() > Date.now()) return subscription;

    const updated = await this.prisma.havelioSubscription.update({
      where: { id: subscription.id },
      data: { status: "EXPIRED" },
    });
    await this.auditService.log({
      tenantId: subscription.tenantId,
      action: "billing.trial.expired",
      entityType: "HavelioSubscription",
      entityId: subscription.id,
    });
    return updated;
  }

  private async applyScheduledDowngradeIfDue(
    subscription: HavelioSubscription,
  ): Promise<HavelioSubscription> {
    if (!subscription.scheduledPlan || !subscription.currentPeriodEnd) return subscription;
    if (subscription.currentPeriodEnd.getTime() > Date.now()) return subscription;
    if (subscription.status !== "ACTIVE" && subscription.status !== "PAST_DUE") return subscription;

    const newPlan = subscription.scheduledPlan;
    const newInterval = subscription.scheduledBillingInterval ?? subscription.billingInterval ?? "MONTHLY";

    if (subscription.stripeSubscriptionId && this.stripeProvider.isConfigured()) {
      const newPriceId = getPriceId(
        this.configService,
        newPlan as Exclude<HavelioPlan, "ENTERPRISE">,
        newInterval,
      );
      if (newPriceId) {
        try {
          await this.stripeProvider.updateSubscriptionPrice(
            subscription.stripeSubscriptionId,
            newPriceId,
            "none",
          );
        } catch (error) {
          this.logger.error(
            `Failed to apply scheduled downgrade in Stripe for tenant ${subscription.tenantId}: ${String(error)}`,
          );
          // Do not update the local plan if the Stripe-side change failed —
          // leave the schedule in place to retry on the next read, never
          // silently diverge from Stripe's own truth.
          return subscription;
        }
      }
    }

    const updated = await this.prisma.havelioSubscription.update({
      where: { id: subscription.id },
      data: {
        plan: newPlan,
        billingInterval: newInterval,
        scheduledPlan: null,
        scheduledBillingInterval: null,
      },
    });
    await this.auditService.log({
      tenantId: subscription.tenantId,
      action: "billing.plan.downgrade_applied",
      entityType: "HavelioSubscription",
      entityId: subscription.id,
      metadata: { plan: newPlan, billingInterval: newInterval },
    });
    return updated;
  }

  /**
   * Starts Stripe Checkout for a NEW paid subscription. Only reachable when
   * the tenant does not already have a live Stripe subscription (TRIALING/
   * EXPIRED/CANCELED tenants) — an existing subscription is changed via
   * `changePlan`/the Stripe billing portal instead, never re-checked-out.
   */
  async createCheckoutSession(
    tenantId: string,
    actorUserId: string,
    plan: Exclude<HavelioPlan, "ENTERPRISE">,
    interval: "MONTHLY" | "ANNUAL",
    customerEmail: string,
    successUrl: string,
    cancelUrl: string,
    promoCode?: string,
  ): Promise<{ url: string }> {
    if (!this.stripeProvider.isConfigured()) {
      throw new ConflictException("Stripe billing is not configured in this environment.");
    }

    const subscription = await this.getSubscription(tenantId);
    if (subscription.status === "ACTIVE" || subscription.status === "PAST_DUE") {
      throw new ConflictException(
        "This tenant already has an active subscription — use Upgrade/Downgrade instead of starting a new checkout.",
      );
    }

    let stripePromotionCodeId: string | null = null;
    let promoCodeId: string | null = null;
    if (promoCode) {
      const validated = await this.promoCodesService.validateForCheckout(promoCode, tenantId, plan, interval);
      stripePromotionCodeId = validated.stripePromotionCodeId;
      promoCodeId = validated.promoCode.id;
    }

    const result = await this.stripeProvider.createCheckoutSession({
      tenantId,
      plan,
      interval,
      existingStripeCustomerId: subscription.stripeCustomerId,
      customerEmail,
      successUrl,
      cancelUrl,
      stripePromotionCodeId,
      promoCodeId,
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "billing.checkout.initiated",
      entityType: "HavelioSubscription",
      entityId: subscription.id,
      metadata: { plan, interval, promoCode: promoCode ?? null },
    });

    return { url: result.url };
  }

  async createBillingPortalSession(tenantId: string, returnUrl: string): Promise<{ url: string }> {
    if (!this.stripeProvider.isConfigured()) {
      throw new ConflictException("Stripe billing is not configured in this environment.");
    }
    const subscription = await this.getSubscription(tenantId);
    if (!subscription.stripeCustomerId) {
      throw new ConflictException("This tenant has no Stripe customer yet.");
    }
    return this.stripeProvider.createBillingPortalSession(subscription.stripeCustomerId, returnUrl);
  }

  /** Self-service cancellation — always cancel-at-period-end in V1 (see docs/DECISIONS.md). */
  async cancelAtPeriodEnd(tenantId: string, actorUserId: string): Promise<HavelioSubscription> {
    const subscription = await this.getSubscription(tenantId);
    if (!subscription.stripeSubscriptionId) {
      throw new ConflictException("This tenant has no active Stripe subscription to cancel.");
    }
    if (this.stripeProvider.isConfigured()) {
      await this.stripeProvider.cancelAtPeriodEnd(subscription.stripeSubscriptionId);
    }
    const updated = await this.prisma.havelioSubscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true },
    });
    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "billing.subscription.canceled",
      entityType: "HavelioSubscription",
      entityId: subscription.id,
      metadata: { effectiveAt: subscription.currentPeriodEnd?.toISOString() ?? null },
    });
    return updated;
  }

  async resumeSubscription(tenantId: string, actorUserId: string): Promise<HavelioSubscription> {
    const subscription = await this.getSubscription(tenantId);
    if (!subscription.cancelAtPeriodEnd) {
      throw new ConflictException("This subscription is not scheduled for cancellation.");
    }
    if (!subscription.stripeSubscriptionId) {
      throw new ConflictException("This tenant has no active Stripe subscription to resume.");
    }
    if (this.stripeProvider.isConfigured()) {
      await this.stripeProvider.resumeSubscription(subscription.stripeSubscriptionId);
    }
    const updated = await this.prisma.havelioSubscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: false },
    });
    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "billing.subscription.resumed",
      entityType: "HavelioSubscription",
      entityId: subscription.id,
    });
    return updated;
  }

  /**
   * Upgrade/downgrade/interval-switch for an ALREADY-active paid
   * subscription. V1 policy (see docs/DECISIONS.md):
   *   - Plan-tier UPGRADE (or a same-tier interval switch): applied
   *     immediately, with Stripe's own proration ("create_prorations").
   *   - Plan-tier DOWNGRADE: scheduled to apply at `currentPeriodEnd` —
   *     never immediately, so a tenant already over the lower plan's limits
   *     is never suddenly locked out or has data deleted. See
   *     applyScheduledDowngradeIfDue.
   */
  async changePlan(
    tenantId: string,
    actorUserId: string,
    newPlan: Exclude<HavelioPlan, "ENTERPRISE">,
    newInterval: "MONTHLY" | "ANNUAL",
  ): Promise<HavelioSubscription> {
    const subscription = await this.getSubscription(tenantId);
    if (subscription.status !== "ACTIVE" && subscription.status !== "PAST_DUE") {
      throw new ConflictException(
        "This tenant has no active paid subscription to change — use Checkout to start one.",
      );
    }
    if (!subscription.stripeSubscriptionId) {
      throw new ConflictException("This tenant's subscription has no linked Stripe subscription.");
    }

    const currentPlan = subscription.plan as Exclude<HavelioPlan, "ENTERPRISE">;
    const isUpgrade = PLAN_RANK[newPlan] > PLAN_RANK[currentPlan];
    const isDowngrade = PLAN_RANK[newPlan] < PLAN_RANK[currentPlan];

    if (!isUpgrade && !isDowngrade) {
      // Same plan tier, interval switch only — treated as immediate, like an upgrade.
      return this.applyImmediatePlanChange(subscription, newPlan, newInterval, actorUserId);
    }
    if (isUpgrade) {
      return this.applyImmediatePlanChange(subscription, newPlan, newInterval, actorUserId);
    }

    // Downgrade — schedule for currentPeriodEnd, no immediate Stripe call.
    const updated = await this.prisma.havelioSubscription.update({
      where: { id: subscription.id },
      data: { scheduledPlan: newPlan, scheduledBillingInterval: newInterval },
    });
    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "billing.plan.downgrade_scheduled",
      entityType: "HavelioSubscription",
      entityId: subscription.id,
      metadata: {
        fromPlan: currentPlan,
        toPlan: newPlan,
        toInterval: newInterval,
        effectiveAt: subscription.currentPeriodEnd?.toISOString() ?? null,
      },
    });
    return updated;
  }

  private async applyImmediatePlanChange(
    subscription: HavelioSubscription,
    newPlan: Exclude<HavelioPlan, "ENTERPRISE">,
    newInterval: "MONTHLY" | "ANNUAL",
    actorUserId: string,
  ): Promise<HavelioSubscription> {
    const newPriceId = getPriceId(this.configService, newPlan, newInterval);
    if (!newPriceId) {
      throw new BadRequestException(`No Stripe Price configured for ${newPlan}/${newInterval}.`);
    }
    if (this.stripeProvider.isConfigured()) {
      await this.stripeProvider.updateSubscriptionPrice(
        subscription.stripeSubscriptionId!,
        newPriceId,
        "create_prorations",
      );
    }
    const updated = await this.prisma.havelioSubscription.update({
      where: { id: subscription.id },
      data: {
        plan: newPlan,
        billingInterval: newInterval,
        stripePriceId: newPriceId,
        scheduledPlan: null,
        scheduledBillingInterval: null,
      },
    });
    await this.auditService.log({
      tenantId: subscription.tenantId,
      userId: actorUserId,
      action: "billing.plan.upgraded",
      entityType: "HavelioSubscription",
      entityId: subscription.id,
      metadata: { fromPlan: subscription.plan, toPlan: newPlan, toInterval: newInterval },
    });
    return updated;
  }

  // ---------------------------------------------------------------------
  // Webhook handling — see StripeWebhooksController for signature
  // verification + idempotency, both applied before any of these are
  // called.
  // ---------------------------------------------------------------------

  async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const tenantId = session.client_reference_id ?? (session.metadata?.tenantId as string | undefined);
    const subscriptionId =
      typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (!tenantId || !subscriptionId) {
      this.logger.warn(`checkout.session.completed ${session.id} missing tenantId or subscription id.`);
      return;
    }
    const subscription = await this.stripeProvider.retrieveSubscription(subscriptionId);
    await this.upsertFromStripeSubscription(subscription, tenantId);

    const promoCodeId = session.metadata?.promoCodeId;
    if (promoCodeId) {
      await this.promoCodesService.incrementRedemptionCount(promoCodeId);
    }
  }

  async handleSubscriptionUpsert(subscription: Stripe.Subscription): Promise<void> {
    const tenantId = subscription.metadata?.tenantId as string | undefined;
    await this.upsertFromStripeSubscription(subscription, tenantId);
  }

  private async upsertFromStripeSubscription(
    subscription: Stripe.Subscription,
    fallbackTenantId?: string,
  ): Promise<void> {
    let tenantId = fallbackTenantId;
    if (!tenantId) {
      const existing = await this.prisma.havelioSubscription.findUnique({
        where: { stripeSubscriptionId: subscription.id },
      });
      tenantId = existing?.tenantId;
    }
    if (!tenantId) {
      this.logger.error(`Cannot resolve tenantId for Stripe subscription ${subscription.id}.`);
      return;
    }

    const priceId = extractPriceId(subscription);
    const mapped = priceId ? reversePriceLookup(this.configService, priceId) : null;
    const period = extractCurrentPeriod(subscription);
    const status = mapStripeSubscriptionStatus(subscription.status);
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

    const existing = await this.prisma.havelioSubscription.findUnique({ where: { tenantId } });
    const wasActive = existing?.status === "ACTIVE" || existing?.status === "PAST_DUE";

    const updated = await this.prisma.havelioSubscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        plan: mapped?.plan ?? "STARTER",
        billingInterval: mapped?.interval ?? "MONTHLY",
        status,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      },
      update: {
        // Only touch plan/billingInterval when the price mapped to a known
        // plan — `exactOptionalPropertyTypes` treats an explicit
        // `undefined` value differently from an omitted key, so the key is
        // conditionally spread in rather than set to `undefined`.
        ...(mapped ? { plan: mapped.plan, billingInterval: mapped.interval } : {}),
        status,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      },
    });

    if (!wasActive && (status === "ACTIVE" || status === "PAST_DUE")) {
      await this.auditService.log({
        tenantId,
        action: "billing.subscription.activated",
        entityType: "HavelioSubscription",
        entityId: updated.id,
        metadata: { plan: updated.plan, billingInterval: updated.billingInterval },
      });
    }
  }

  async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const existing = await this.prisma.havelioSubscription.findUnique({
      where: { stripeSubscriptionId: subscription.id },
    });
    if (!existing) {
      this.logger.warn(`customer.subscription.deleted for unknown subscription ${subscription.id}.`);
      return;
    }
    await this.prisma.havelioSubscription.update({
      where: { id: existing.id },
      data: { status: "CANCELED", cancelAtPeriodEnd: false, canceledAt: new Date() },
    });
    await this.auditService.log({
      tenantId: existing.tenantId,
      action: "billing.subscription.ended",
      entityType: "HavelioSubscription",
      entityId: existing.id,
    });
  }

  /**
   * A successful payment clears a PAST_DUE status back to ACTIVE promptly —
   * `customer.subscription.updated` will eventually reflect this too, but
   * relying only on that risks a visible lag between "the card was charged"
   * and "the Billing page stops saying past-due."
   */
  async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = extractInvoiceSubscriptionId(invoice);
    if (!subscriptionId) return;
    const existing = await this.prisma.havelioSubscription.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
    });
    if (!existing || existing.status !== "PAST_DUE") return;
    await this.prisma.havelioSubscription.update({
      where: { id: existing.id },
      data: { status: "ACTIVE" },
    });
    await this.auditService.log({
      tenantId: existing.tenantId,
      action: "billing.invoice.paid",
      entityType: "HavelioSubscription",
      entityId: existing.id,
      metadata: { stripeInvoiceId: invoice.id },
    });
  }

  async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = extractInvoiceSubscriptionId(invoice);
    if (!subscriptionId) return;
    const existing = await this.prisma.havelioSubscription.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
    });
    if (!existing) return;
    await this.prisma.havelioSubscription.update({
      where: { id: existing.id },
      data: { status: "PAST_DUE" },
    });
    await this.auditService.log({
      tenantId: existing.tenantId,
      action: "billing.invoice.payment_failed",
      entityType: "HavelioSubscription",
      entityId: existing.id,
      metadata: { stripeInvoiceId: invoice.id },
    });
  }

  /** Resolves a tenantId for an invoice — used by AffiliateCommissionService, which never queries Stripe/HavelioSubscription directly. */
  async findTenantIdForSubscription(stripeSubscriptionId: string): Promise<string | null> {
    const existing = await this.prisma.havelioSubscription.findUnique({
      where: { stripeSubscriptionId },
    });
    return existing?.tenantId ?? null;
  }
}

function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status,
): "ACTIVE" | "PAST_DUE" | "CANCELED" | "INCOMPLETE" {
  switch (status) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    case "incomplete":
    case "paused":
      return "INCOMPLETE";
    default:
      return "INCOMPLETE";
  }
}

export { ORDERED_PLANS, getPlanDefinition };
