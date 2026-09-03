import type Stripe from "stripe";

/** DI token — see StripeWebhooksController's own doc comment for why this seam exists. */
export const AFFILIATE_INVOICE_EVENT_HANDLER = Symbol("AFFILIATE_INVOICE_EVENT_HANDLER");

/**
 * The one seam StripeWebhooksController uses to reach the affiliate
 * commission domain, without BillingModule ever depending on AffiliateModule
 * (see stripe-webhooks.controller.ts's own doc comment). Bound to the real
 * AffiliateCommissionService by AffiliateModule; bound to a no-op when
 * AffiliateModule isn't wired in (never the case in production — see
 * StripeWebhooksModule).
 */
export interface IAffiliateInvoiceEventHandler {
  handleInvoicePaid(invoice: Stripe.Invoice): Promise<void>;
  handleChargeRefunded(charge: Stripe.Charge): Promise<void>;
}
