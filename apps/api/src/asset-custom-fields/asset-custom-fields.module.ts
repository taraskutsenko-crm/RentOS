import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { TenantsModule } from "../tenants/tenants.module";
import { AssetCustomFieldsController } from "./asset-custom-fields.controller";
import { AssetCustomFieldsService } from "./asset-custom-fields.service";

@Module({
  imports: [TenantsModule, AuditModule, PermissionsModule],
  controllers: [AssetCustomFieldsController],
  providers: [AssetCustomFieldsService],
  exports: [AssetCustomFieldsService],
})
export class AssetCustomFieldsModule {}
