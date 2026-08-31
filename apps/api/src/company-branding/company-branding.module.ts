import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { StorageModule } from "../storage/storage.module";
import { TenantsModule } from "../tenants/tenants.module";
import { CompanyLogoController } from "./company-logo.controller";
import { CompanyLogoService } from "./company-logo.service";

@Module({
  imports: [TenantsModule, AuditModule, PermissionsModule, StorageModule],
  controllers: [CompanyLogoController],
  providers: [CompanyLogoService],
  exports: [CompanyLogoService],
})
export class CompanyBrandingModule {}
