import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { TenantsModule } from "../tenants/tenants.module";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";

@Module({
  imports: [TenantsModule, AuditModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
