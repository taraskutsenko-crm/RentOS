import { Module } from "@nestjs/common";

import { AssetStatusesModule } from "../asset-statuses/asset-statuses.module";
import { AuditModule } from "../audit/audit.module";
import { BillingModule } from "../billing/billing.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { AvailabilityModule } from "../rentals/availability.module";
import { TenantsModule } from "../tenants/tenants.module";
import { AssetFieldValuesService } from "./asset-field-values.service";
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";

@Module({
  imports: [
    TenantsModule,
    AuditModule,
    PermissionsModule,
    AssetStatusesModule,
    AvailabilityModule,
    BillingModule,
  ],
  controllers: [AssetsController],
  providers: [AssetsService, AssetFieldValuesService],
  exports: [AssetsService, AssetFieldValuesService],
})
export class AssetsModule {}
