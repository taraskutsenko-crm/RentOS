import { Module } from "@nestjs/common";

import { AssetStatusesModule } from "../asset-statuses/asset-statuses.module";
import { AssetsModule } from "../assets/assets.module";
import { AuditModule } from "../audit/audit.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { RentalBillingSettingsModule } from "../rental-billing-settings/rental-billing-settings.module";
import { TenantsModule } from "../tenants/tenants.module";
import { AvailabilityService } from "./availability.service";
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
  ],
  controllers: [RentalsController],
  providers: [RentalsService, AvailabilityService],
  exports: [RentalsService, AvailabilityService],
})
export class RentalsModule {}
