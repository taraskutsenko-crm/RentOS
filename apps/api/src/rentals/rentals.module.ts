import { Module } from "@nestjs/common";

import { AssetStatusesModule } from "../asset-statuses/asset-statuses.module";
import { AssetsModule } from "../assets/assets.module";
import { AuditModule } from "../audit/audit.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { RentalBillingSettingsModule } from "../rental-billing-settings/rental-billing-settings.module";
import { TenantsModule } from "../tenants/tenants.module";
import { AvailabilityModule } from "./availability.module";
import { RentalDepositsService } from "./rental-deposits.service";
import { RentalsController } from "./rentals.controller";
import { RentalsService } from "./rentals.service";

@Module({
  imports: [
    TenantsModule,
    AuditModule,
    PermissionsModule,
    AssetStatusesModule,
    AssetsModule,
    RentalBillingSettingsModule,
    AvailabilityModule,
  ],
  controllers: [RentalsController],
  providers: [RentalsService, RentalDepositsService],
  // Re-exports AvailabilityModule (not just the service) so every existing
  // consumer that imports RentalsModule for AvailabilityService is unaffected.
  exports: [RentalsService, RentalDepositsService, AvailabilityModule],
})
export class RentalsModule {}
