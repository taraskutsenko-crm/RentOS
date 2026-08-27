import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CompanyBankAccountsModule } from "../bank-accounts/company-bank-accounts.module";
import { DocumentsModule } from "../documents/documents.module";
import { EmailModule } from "../email/email.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { TenantsModule } from "../tenants/tenants.module";
import { InvoiceEmailService } from "./invoice-email.service";
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
    EmailModule,
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoiceRendererService, InvoicePdfService, InvoiceEmailService],
  exports: [InvoicesService, InvoiceRendererService, InvoicePdfService, InvoiceEmailService],
})
export class InvoicesModule {}
