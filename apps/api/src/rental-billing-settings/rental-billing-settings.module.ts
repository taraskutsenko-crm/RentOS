import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { TenantsModule } from "../tenants/tenants.module";
import { RentalBillingSettingsController } from "./rental-billing-settings.controller";
import { RentalBillingSettingsService } from "./rental-billing-settings.service";

@Module({
  imports: [TenantsModule, AuditModule, PermissionsModule],
  controllers: [RentalBillingSettingsController],
  providers: [RentalBillingSettingsService],
  exports: [RentalBillingSettingsService],
})
export class RentalBillingSettingsModule {}
