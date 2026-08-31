import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { StorageModule } from "../storage/storage.module";
import { TenantsModule } from "../tenants/tenants.module";
import { CompanySignatureController } from "./company-signature.controller";
import { CompanySignatureService } from "./company-signature.service";

@Module({
  imports: [TenantsModule, AuditModule, PermissionsModule, StorageModule],
  controllers: [CompanySignatureController],
  providers: [CompanySignatureService],
  exports: [CompanySignatureService],
})
export class CompanySignatureModule {}
