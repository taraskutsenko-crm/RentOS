import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { MembershipsModule } from "../memberships/memberships.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { TenantGuard } from "./tenant.guard";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";

@Module({
  imports: [MembershipsModule, AuditModule, PermissionsModule],
  controllers: [TenantsController],
  providers: [TenantsService, TenantGuard],
  // Re-export MembershipsModule: any module that imports TenantsModule to
  // reuse TenantGuard must also have TenantGuard's own dependency
  // (MembershipsService) resolvable, or Nest fails to instantiate it.
  exports: [TenantsService, TenantGuard, MembershipsModule],
})
export class TenantsModule {}
