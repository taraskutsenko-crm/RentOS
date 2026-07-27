import { Module } from "@nestjs/common";

import { MembershipsModule } from "../memberships/memberships.module";
import { TenantGuard } from "./tenant.guard";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";

@Module({
  imports: [MembershipsModule],
  controllers: [TenantsController],
  providers: [TenantsService, TenantGuard],
  exports: [TenantsService],
})
export class TenantsModule {}
