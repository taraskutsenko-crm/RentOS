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
 * The Stripe Invoice ID a Charge belongs to. Stripe's public REST API still
 * returns `invoice` on a Charge object for a charge that paid an invoice,
 * but the pinned SDK's TypeScript types (2026-08-26.dahlia) no longer model
 * it on `Stripe.Charge` — the field moved out of the strictly-typed surface
 * along with the other 2025 Invoice/Subscription restructuring (see
 * extractCurrentPeriod/extractInvoiceSubscriptionId above for the same
 * pattern). Read defensively via an unknown-typed view rather than `any`.
 */
export function extractChargeInvoiceId(charge: Stripe.Charge): string | null {
  const withInvoice = charge as unknown as { invoice?: string | { id: string } | null };
  const invoice = withInvoice.invoice;
  if (!invoice) return null;
  return typeof invoice === "string" ? invoice : invoice.id;
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
