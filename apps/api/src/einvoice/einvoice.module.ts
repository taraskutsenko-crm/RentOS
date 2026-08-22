import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { EncryptionService } from "../common/encryption.service";
import { PermissionsModule } from "../permissions/permissions.module";
import { TenantsModule } from "../tenants/tenants.module";
import { EInvoiceConnectionsController } from "./einvoice-connections.controller";
import { EInvoiceConnectionsService } from "./einvoice-connections.service";
import { KsefProvider } from "./providers/ksef-provider.service";

@Module({
  imports: [TenantsModule, AuditModule, PermissionsModule],
  controllers: [EInvoiceConnectionsController],
  providers: [EInvoiceConnectionsService, EncryptionService, KsefProvider],
  exports: [EInvoiceConnectionsService],
})
export class EInvoiceModule {}
