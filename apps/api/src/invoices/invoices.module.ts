import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CompanyBankAccountsModule } from "../bank-accounts/company-bank-accounts.module";
import { DocumentsModule } from "../documents/documents.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { TenantsModule } from "../tenants/tenants.module";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { InvoicePdfService } from "./rendering/invoice-pdf.service";
import { InvoiceRendererService } from "./rendering/invoice-renderer.service";

@Module({
  imports: [
    TenantsModule,
    AuditModule,
    PermissionsModule,
    CompanyBankAccountsModule,
    DocumentsModule,
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoiceRendererService, InvoicePdfService],
  exports: [InvoicesService, InvoiceRendererService, InvoicePdfService],
})
export class InvoicesModule {}
