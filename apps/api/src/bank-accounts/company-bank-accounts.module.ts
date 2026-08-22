import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { TenantsModule } from "../tenants/tenants.module";
import { CompanyBankAccountsController } from "./company-bank-accounts.controller";
import { CompanyBankAccountsService } from "./company-bank-accounts.service";

@Module({
  imports: [TenantsModule, AuditModule, PermissionsModule],
  controllers: [CompanyBankAccountsController],
  providers: [CompanyBankAccountsService],
  exports: [CompanyBankAccountsService],
})
export class CompanyBankAccountsModule {}
