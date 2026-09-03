import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { BillingModule } from "../billing/billing.module";
import { AffiliateAnalyticsService } from "./affiliate-analytics.service";
import { AffiliateAttributionService } from "./affiliate-attribution.service";
import { AffiliateCommissionService } from "./affiliate-commission.service";
import { AffiliatePartnersService } from "./affiliate-partners.service";
import { AffiliatePayoutsService } from "./affiliate-payouts.service";
import { PlatformAdminAffiliateController } from "./platform-admin-affiliate.controller";

/**
 * Havelio Affiliate/Partner domain (Stage 17) — AffiliatePartner/
 * AffiliateCampaign/AffiliateAttribution/AffiliateCommissionEntry/
 * AffiliatePayout. Imports BillingModule (for PromoCodesService,
 * SubscriptionsService.findTenantIdForSubscription, and PlatformAdminGuard)
 * but BillingModule never imports this module back — see
 * stripe-webhooks.module.ts's own doc comment for how the webhook
 * controller reaches both without a circular dependency.
 */
@Module({
  imports: [BillingModule, AuditModule],
  controllers: [PlatformAdminAffiliateController],
  providers: [
    AffiliatePartnersService,
    AffiliateAttributionService,
    AffiliateCommissionService,
    AffiliatePayoutsService,
    AffiliateAnalyticsService,
  ],
  exports: [AffiliateAttributionService, AffiliateCommissionService],
})
export class AffiliateModule {}
