import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import type Stripe from "stripe";

import { Public } from "../auth/decorators/public.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { STRIPE_PROVIDER, type IStripeProvider } from "./billing.types";
import { SubscriptionsService } from "./subscriptions.service";
import { AFFILIATE_INVOICE_EVENT_HANDLER, type IAffiliateInvoiceEventHandler } from "./affiliate-invoice-event-handler.types";

/**
 * Stripe webhook receiver — the only trusted source of truth for Havelio
 * subscription state changes (see docs/DECISIONS.md "never mark a
 * subscription ACTIVE merely because the browser returned to a success
 * URL"). Public (no session cookie — Stripe calls this server-to-server)
 * but every request's signature is verified against STRIPE_WEBHOOK_SECRET
 * before any event is trusted; an invalid/forged signature is rejected
 * with 400 and never reaches SubscriptionsService.
 *
 * Idempotency: Stripe's own delivery guarantee is "at least once," so every
 * event may be redelivered. `StripeWebhookEvent` (keyed by the real Stripe
 * event id) gives a database-level, not just application-logic,
 * duplicate-processing guard — see stripe-webhooks.controller.spec.ts.
 *
 * Affiliate commission calculation (invoice.paid/charge.refunded) is
 * dispatched through IAffiliateInvoiceEventHandler — a small interface this
 * controller depends on, bound to the real AffiliateCommissionService by
 * StripeWebhooksModule (which imports both BillingModule and
 * AffiliateModule). This keeps BillingModule itself free of any dependency
 * on the affiliate domain, matching the three-domain separation documented
 * in schema.prisma's Stage 17 header comment.
 */
@Public()
@Controller("billing/stripe/webhook")
export class StripeWebhooksController {
  private readonly logger = new Logger(StripeWebhooksController.name);

  constructor(
    @Inject(STRIPE_PROVIDER) private readonly stripeProvider: IStripeProvider,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly prisma: PrismaService,
    @Inject(AFFILIATE_INVOICE_EVENT_HANDLER)
    private readonly affiliateHandler: IAffiliateInvoiceEventHandler,
  ) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!this.stripeProvider.isConfigured()) {
      throw new ServiceUnavailableException("Stripe billing is not configured in this environment.");
    }
    if (!signature || !req.rawBody) {
      throw new BadRequestException("Missing Stripe-Signature header or request body.");
    }

    let event: Stripe.Event;
    try {
      event = this.stripeProvider.constructWebhookEvent(req.rawBody, signature);
    } catch (error) {
      this.logger.warn(`Rejected webhook with invalid signature: ${String(error)}`);
      throw new BadRequestException("Invalid webhook signature.");
    }

    const isNewEvent = await this.recordEventOnce(event.id, event.type);
    if (!isNewEvent) {
      // Already processed on a prior delivery — return 200 without
      // reprocessing, per Stripe's own idempotency guidance.
      return { received: true };
    }

    await this.dispatch(event);
    return { received: true };
  }

  /** Returns true if this event was newly recorded (i.e. never seen before). */
  private async recordEventOnce(eventId: string, type: string): Promise<boolean> {
    try {
      await this.prisma.stripeWebhookEvent.create({ data: { id: eventId, type } });
      return true;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return false;
      }
      throw error;
    }
  }

  private async dispatch(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case "checkout.session.completed":
        await this.subscriptionsService.handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await this.subscriptionsService.handleSubscriptionUpsert(
          event.data.object as Stripe.Subscription,
        );
        break;
      case "customer.subscription.deleted":
        await this.subscriptionsService.handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
        break;
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        await this.subscriptionsService.handleInvoicePaid(invoice);
        await this.affiliateHandler.handleInvoicePaid(invoice);
        break;
      }
      case "invoice.payment_failed":
        await this.subscriptionsService.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case "charge.refunded":
        await this.affiliateHandler.handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }
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
