import type { BillingInterval, HavelioPlan } from "@prisma/client";
import type Stripe from "stripe";

/** DI token for the bound StripeProvider — mirrors EMAIL_PROVIDER/STORAGE_ADAPTER's pattern exactly. */
export const STRIPE_PROVIDER = Symbol("STRIPE_PROVIDER");

export interface CreateCheckoutSessionInput {
  tenantId: string;
  plan: Exclude<HavelioPlan, "ENTERPRISE">;
  interval: BillingInterval;
  /** Existing Stripe Customer, when this tenant already has one (e.g. a prior canceled subscription). */
  existingStripeCustomerId?: string | null;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  /** A real Stripe Promotion Code id (`promo_...`), never the human-readable code — see PromoCodesService. */
  stripePromotionCodeId?: string | null;
  /** Havelio's own PromoCode.id, round-tripped via Checkout Session metadata purely to increment PromoCode.redemptionCount once checkout genuinely completes — never used for discount math (Stripe owns that). */
  promoCodeId?: string | null;
}

export interface CheckoutSessionResult {
  stripeSessionId: string;
  url: string;
}

export interface BillingPortalSessionResult {
  url: string;
}

/**
 * Swappable Stripe billing transport, mirroring EmailProvider/StorageAdapter
 * (see email.types.ts's own doc comment) — one real implementation
 * (StripeProvider), gated end-to-end by `isConfigured()` so every caller can
 * show a truthful "Stripe billing is not configured" message instead of
 * faking a successful checkout/subscription/cancellation (see
 * docs/DECISIONS.md). No caller anywhere else in the codebase talks to the
 * `stripe` SDK directly — this interface is the one seam.
 */
export interface IStripeProvider {
  /** True only when STRIPE_SECRET_KEY is set — see StripeProvider.isConfigured. */
  isConfigured(): boolean;

  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult>;

  createBillingPortalSession(
    stripeCustomerId: string,
    returnUrl: string,
  ): Promise<BillingPortalSessionResult>;

  /** Schedules cancellation at the end of the current paid period — never an immediate cancel in V1 (see docs/DECISIONS.md). */
  cancelAtPeriodEnd(stripeSubscriptionId: string): Promise<void>;

  /** Removes a pending cancel-at-period-end schedule, restoring normal renewal. */
  resumeSubscription(stripeSubscriptionId: string): Promise<void>;

  /**
   * Switches an active subscription to a different Price. `prorationBehavior`
   * is passed straight through to Stripe's own subscription-update proration
   * semantics — see docs/DECISIONS.md "Upgrade/downgrade" for the exact V1
   * policy (`"create_prorations"` for an immediate upgrade, `"none"` for a
   * downgrade scheduled to apply only at the next period via SubscriptionsService).
   */
  updateSubscriptionPrice(
    stripeSubscriptionId: string,
    newStripePriceId: string,
    prorationBehavior: "create_prorations" | "none",
  ): Promise<void>;

  retrieveSubscription(stripeSubscriptionId: string): Promise<Stripe.Subscription>;

  /** Looks up a Stripe Promotion Code by its human-readable code (case-sensitive at the Stripe API level — callers upper-case first). Returns null when not found or inactive. */
  findActivePromotionCode(code: string): Promise<Stripe.PromotionCode | null>;

  /**
   * Verifies an inbound webhook's signature and parses it — throws
   * `Stripe.errors.StripeSignatureVerificationError` on an invalid/forged
   * signature (see StripeWebhooksController, which must return 400 rather
   * than ever process an unverified body).
   */
  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event;
}
