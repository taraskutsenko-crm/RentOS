import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { apiEnvSchema } from "@rentos/shared";

import { AssetAvailabilityModule } from "./asset-availability/asset-availability.module";
import { AssetCategoriesModule } from "./asset-categories/asset-categories.module";
import { AssetCustomFieldsModule } from "./asset-custom-fields/asset-custom-fields.module";
import { AssetFilesModule } from "./asset-files/asset-files.module";
import { AssetStatusesModule } from "./asset-statuses/asset-statuses.module";
import { AssetsModule } from "./assets/assets.module";
import { AuthModule } from "./auth/auth.module";
import { CompanyBankAccountsModule } from "./bank-accounts/company-bank-accounts.module";
import { CompanyBrandingModule } from "./company-branding/company-branding.module";
import { CompanySignatureModule } from "./company-signature/company-signature.module";
import { CustomerPortalModule } from "./customer-portal/customer-portal.module";
import { CustomersModule } from "./customers/customers.module";
import { DocumentsModule } from "./documents/documents.module";
import { EInvoiceModule } from "./einvoice/einvoice.module";
import { HealthModule } from "./health/health.module";
import { InvoicesModule } from "./invoices/invoices.module";
import { PaymentsModule } from "./payments/payments.module";
import { PrismaModule } from "./prisma/prisma.module";
import { QuotesModule } from "./quotes/quotes.module";
import { RentalBillingSettingsModule } from "./rental-billing-settings/rental-billing-settings.module";
import { RentalsModule } from "./rentals/rentals.module";
import { TenantsModule } from "./tenants/tenants.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>) => apiEnvSchema.parse(config),
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      // The test suite deliberately hammers auth endpoints across many
      // cases within the same rate-limit window; rate limiting itself is
      // not what those tests exercise.
      skipIf: () => process.env.NODE_ENV === "test",
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    TenantsModule,
    CustomersModule,
    AssetStatusesModule,
    AssetCategoriesModule,
    AssetCustomFieldsModule,
    AssetsModule,
    AssetFilesModule,
    RentalsModule,
    AssetAvailabilityModule,
    RentalBillingSettingsModule,
    QuotesModule,
    DocumentsModule,
    CustomerPortalModule,
    CompanyBankAccountsModule,
    CompanyBrandingModule,
    CompanySignatureModule,
    InvoicesModule,
    PaymentsModule,
    EInvoiceModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
