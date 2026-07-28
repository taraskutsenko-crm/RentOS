import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { StorageModule } from "../storage/storage.module";
import { TenantsModule } from "../tenants/tenants.module";
import { AssetFilesController } from "./asset-files.controller";
import { AssetFilesService } from "./asset-files.service";

@Module({
  imports: [TenantsModule, AuditModule, PermissionsModule, StorageModule],
  controllers: [AssetFilesController],
  providers: [AssetFilesService],
  exports: [AssetFilesService],
})
export class AssetFilesModule {}
