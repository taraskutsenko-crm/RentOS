import { Module } from "@nestjs/common";

import { AffiliateCommissionService } from "../affiliate/affiliate-commission.service";
import { AffiliateModule } from "../affiliate/affiliate.module";
import { AFFILIATE_INVOICE_EVENT_HANDLER } from "./affiliate-invoice-event-handler.types";
import { BillingModule } from "./billing.module";
import { StripeWebhooksController } from "./stripe-webhooks.controller";

/**
 * Deliberately its own module: StripeWebhooksController needs both
 * SubscriptionsService (BillingModule) and AffiliateCommissionService
 * (AffiliateModule), and AffiliateModule already depends on BillingModule —
 * putting the webhook controller inside either of those two would create a
 * circular module dependency. This module only ever consumes both; neither
 * of them depends on it.
 */
@Module({
  imports: [BillingModule, AffiliateModule],
  controllers: [StripeWebhooksController],
  providers: [{ provide: AFFILIATE_INVOICE_EVENT_HANDLER, useExisting: AffiliateCommissionService }],
})
export class StripeWebhooksModule {}
