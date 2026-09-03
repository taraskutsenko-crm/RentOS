import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import type { ApiEnv } from "@rentos/shared";

import { AuditModule } from "../audit/audit.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { TenantsModule } from "../tenants/tenants.module";
import { BillingController } from "./billing.controller";
import { STRIPE_PROVIDER } from "./billing.types";
import { EntitlementsService } from "./entitlements.service";
import { PlatformAdminBillingController } from "./platform-admin-billing.controller";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PromoCodesService } from "./promo-codes.service";
import { StripeProvider } from "./stripe.provider";
import { SubscriptionsService } from "./subscriptions.service";

/**
 * Havelio Billing (Stage 17) — Havelio's own subscription/plan/entitlement
 * domain (never RENTAL FINANCE — see billing.controller.ts's own doc
 * comment). Exports SubscriptionsService/EntitlementsService/
 * PromoCodesService for AuthModule (trial start at registration),
 * AssetsModule (asset-count entitlement enforcement), and AffiliateModule
 * (invoice->tenant resolution for commission calculation) — none of those
 * ever import StripeProvider or the `stripe` SDK directly.
 *
 * StripeWebhooksController deliberately lives in its own module
 * (StripeWebhooksModule), not here — see that module's doc comment.
 */
@Module({
  imports: [ConfigModule, AuditModule, PermissionsModule, TenantsModule],
  controllers: [BillingController, PlatformAdminBillingController],
  providers: [
    {
      provide: STRIPE_PROVIDER,
      useFactory: (configService: ConfigService<ApiEnv, true>) => new StripeProvider(configService),
      inject: [ConfigService],
    },
    SubscriptionsService,
    EntitlementsService,
    PromoCodesService,
    PlatformAdminGuard,
  ],
  exports: [SubscriptionsService, EntitlementsService, PromoCodesService, STRIPE_PROVIDER, PlatformAdminGuard],
})
export class BillingModule {}
