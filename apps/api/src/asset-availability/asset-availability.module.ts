import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { RentalsModule } from "../rentals/rentals.module";
import { TenantsModule } from "../tenants/tenants.module";
import { AssetAvailabilityBlocksController } from "./asset-availability-blocks.controller";
import { AssetAvailabilityBlocksService } from "./asset-availability-blocks.service";

@Module({
  imports: [TenantsModule, AuditModule, PermissionsModule, RentalsModule],
  controllers: [AssetAvailabilityBlocksController],
  providers: [AssetAvailabilityBlocksService],
  exports: [AssetAvailabilityBlocksService],
})
export class AssetAvailabilityModule {}
