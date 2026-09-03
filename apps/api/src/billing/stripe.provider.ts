import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnv } from "@rentos/shared";
import Stripe from "stripe";

import type {
  BillingPortalSessionResult,
  CheckoutSessionResult,
  CreateCheckoutSessionInput,
  IStripeProvider,
} from "./billing.types";
import { getPriceId } from "./stripe-price-map";

/**
 * Real Stripe billing transport — the ONE place in the codebase that
 * imports the `stripe` SDK (mirrors ADR 0005's "nothing outside storage/
 * imports a storage SDK" rule, applied here to Stripe). Every method is a
 * thin, faithful pass-through to a documented Stripe API call — no business
 * logic (plan/entitlement decisions, database writes) lives here; that
 * belongs to SubscriptionsService/StripeWebhooksController, which depend on
 * IStripeProvider, never on this class or the `stripe` package directly.
 *
 * `isConfigured()` gates everything: `false` whenever STRIPE_SECRET_KEY is
 * unset, so BillingController/BillingService can show a truthful "Stripe
 * billing is not configured in this environment" instead of attempting a
 * doomed API call (see docs/DECISIONS.md — never fake a successful
 * checkout/subscription/cancellation/refund/webhook delivery).
 */
@Injectable()
export class StripeProvider implements IStripeProvider {
  private readonly logger = new Logger(StripeProvider.name);
  private readonly client: Stripe | null;
  private readonly webhookSecret: string | undefined;

  constructor(private readonly configService: ConfigService<ApiEnv, true>) {
    const secretKey = this.configService.get("STRIPE_SECRET_KEY", { infer: true });
    this.webhookSecret = this.configService.get("STRIPE_WEBHOOK_SECRET", { infer: true });
    this.client = secretKey
      ? new Stripe(secretKey, {
          // Pinned explicitly (matching the installed `stripe` SDK's own
          // expected version) so a future Stripe SDK upgrade never silently
          // changes request/response shape underneath this integration.
          apiVersion: "2026-08-26.dahlia",
        })
      : null;

    if (!this.client) {
      this.logger.warn(
        "STRIPE_SECRET_KEY is not set — Stripe billing is not configured. " +
          "Checkout/portal/subscription-management calls will be rejected by the caller before reaching this provider.",
      );
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  private requireClient(): Stripe {
    if (!this.client) {
      throw new Error("Stripe is not configured — STRIPE_SECRET_KEY is unset.");
    }
    return this.client;
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult> {
    const client = this.requireClient();
    const priceId = getPriceId(this.configService, input.plan, input.interval);
    if (!priceId) {
      throw new Error(
        `No Stripe Price configured for ${input.plan}/${input.interval} — see STRIPE_PRICE_* env vars.`,
      );
    }

    const session = await client.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      ...(input.existingStripeCustomerId
        ? { customer: input.existingStripeCustomerId }
        : { customer_email: input.customerEmail }),
      ...(input.stripePromotionCodeId
        ? { discounts: [{ promotion_code: input.stripePromotionCodeId }] }
        : { allow_promotion_codes: true }),
      client_reference_id: input.tenantId,
      subscription_data: {
        metadata: { tenantId: input.tenantId, plan: input.plan, interval: input.interval },
      },
      metadata: {
        tenantId: input.tenantId,
        plan: input.plan,
        interval: input.interval,
        ...(input.promoCodeId ? { promoCodeId: input.promoCodeId } : {}),
      },
    });

    if (!session.url) {
      throw new Error("Stripe Checkout Session was created without a redirect URL.");
    }
    return { stripeSessionId: session.id, url: session.url };
  }

  async createBillingPortalSession(
    stripeCustomerId: string,
    returnUrl: string,
  ): Promise<BillingPortalSessionResult> {
    const client = this.requireClient();
    const session = await client.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  }

  async cancelAtPeriodEnd(stripeSubscriptionId: string): Promise<void> {
    const client = this.requireClient();
    await client.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true });
  }

  async resumeSubscription(stripeSubscriptionId: string): Promise<void> {
    const client = this.requireClient();
    await client.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: false });
  }

  async updateSubscriptionPrice(
    stripeSubscriptionId: string,
    newStripePriceId: string,
    prorationBehavior: "create_prorations" | "none",
  ): Promise<void> {
    const client = this.requireClient();
    const subscription = await client.subscriptions.retrieve(stripeSubscriptionId);
    const currentItem = subscription.items.data[0];
    if (!currentItem) {
      throw new Error(`Stripe subscription ${stripeSubscriptionId} has no line items.`);
    }
    await client.subscriptions.update(stripeSubscriptionId, {
      items: [{ id: currentItem.id, price: newStripePriceId }],
      proration_behavior: prorationBehavior,
    });
  }

  retrieveSubscription(stripeSubscriptionId: string): Promise<Stripe.Subscription> {
    const client = this.requireClient();
    return client.subscriptions.retrieve(stripeSubscriptionId);
  }

  async findActivePromotionCode(code: string): Promise<Stripe.PromotionCode | null> {
    const client = this.requireClient();
    const result = await client.promotionCodes.list({ code, active: true, limit: 1 });
    return result.data[0] ?? null;
  }

  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const client = this.requireClient();
    if (!this.webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not configured — cannot verify webhook signatures.");
    }
    // Throws Stripe.errors.StripeSignatureVerificationError on a bad/forged
    // signature — the caller (StripeWebhooksController) must let this
    // propagate as an HTTP 400, never swallow it.
    return client.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }
}
