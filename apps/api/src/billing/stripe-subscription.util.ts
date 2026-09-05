import type Stripe from "stripe";

/**
 * As of the pinned Stripe API version (2026-08-26.dahlia), `current_period_
 * start`/`current_period_end` live on each Subscription *item*, not on the
 * Subscription object itself (Stripe moved this in their 2025 API changes —
 * a subscription can have items with different billing anchors). Havelio
 * subscriptions always have exactly one item (one Price per subscription —
 * see StripeProvider.createCheckoutSession/updateSubscriptionPrice), so the
 * first item's period is the subscription's period.
 */
export function extractCurrentPeriod(subscription: Stripe.Subscription): {
  start: Date | null;
  end: Date | null;
} {
  const item = subscription.items.data[0];
  if (!item) {
    return { start: null, end: null };
  }
  return {
    start: new Date(item.current_period_start * 1000),
    end: new Date(item.current_period_end * 1000),
  };
}

/** The single Price ID for a Havelio subscription's one line item, or null if absent. */
export function extractPriceId(subscription: Stripe.Subscription): string | null {
  return subscription.items.data[0]?.price.id ?? null;
}

/**
 * The Stripe Subscription ID an Invoice belongs to. Also moved off the
 * top-level Invoice object in the pinned API version (2026-08-26.dahlia) —
 * now nested under `invoice.parent.subscription_details.subscription`. Null
 * for a non-subscription (one-off) invoice, which Havelio never issues.
 */
export function extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent;
  if (!parent || parent.type !== "subscription_details") {
    return null;
  }
  const subscription = parent.subscription_details?.subscription;
  if (!subscription) return null;
  return typeof subscription === "string" ? subscription : subscription.id;
}

/**
 * The `tenantId` Havelio stamped onto the subscription at creation time
 * (see StripeProvider.createCheckoutSession's `subscription_data.metadata`),
 * read directly off the invoice's own embedded `subscription_details`
 * snapshot rather than a fresh Subscription fetch. Exists because Stripe
 * does not guarantee `invoice.paid` is delivered after `customer.
 * subscription.created`/checkout.session.completed for a brand-new
 * subscription's first invoice — when it arrives first, `HavelioSubscription
 * .stripeSubscriptionId` isn't populated yet, so a local-DB-only lookup
 * (SubscriptionsService.findTenantIdForSubscription) can miss a real
 * tenant that unambiguously exists. See AffiliateCommissionService
 * .handleInvoicePaid, whose first-conversion commission this ordering race
 * was silently dropping (found via real Stripe Sandbox testing, not
 * inferred).
 */
export function extractInvoiceTenantId(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent;
  if (!parent || parent.type !== "subscription_details") {
    return null;
  }
  const tenantId = parent.subscription_details?.metadata?.tenantId;
  return typeof tenantId === "string" && tenantId.length > 0 ? tenantId : null;
}
