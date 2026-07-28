import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { TenantsModule } from "../tenants/tenants.module";
import { AssetCategoriesController } from "./asset-categories.controller";
import { AssetCategoriesService } from "./asset-categories.service";

@Module({
  imports: [TenantsModule, AuditModule, PermissionsModule],
  controllers: [AssetCategoriesController],
  providers: [AssetCategoriesService],
  exports: [AssetCategoriesService],
})
export class AssetCategoriesModule {}
