import { Module } from "@nestjs/common";

import { BillingModule } from "../billing/billing.module";
import { CompanyBrandingModule } from "../company-branding/company-branding.module";
import { DocumentsModule } from "../documents/documents.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { ReceivablesModule } from "../receivables/receivables.module";
import { TenantsModule } from "../tenants/tenants.module";
import { AssetPerformanceService } from "./asset-performance.service";
import { FinanceExportService } from "./finance-export.service";
import { FinanceReportsController } from "./finance-reports.controller";
import { FinanceReportsService } from "./finance-reports.service";
import { FinanceReportPdfService } from "./rendering/finance-report-pdf.service";
import { FinanceReportRendererService } from "./rendering/finance-report-renderer.service";

@Module({
  // ReceivablesModule (exports ReceivablesService) — every aging/summary
  // figure reuses that already-canonical service rather than
  // recomputing it (see docs/DECISIONS.md). CompanyBrandingModule exports
  // CompanyLogoService, reused by the PDF export exactly like Invoice's
  // own sellerSnapshot logo embedding. DocumentsModule exports
  // PdfRendererService, the shared Puppeteer wrapper every PDF in this
  // codebase renders through.
  imports: [
    TenantsModule,
    PermissionsModule,
    ReceivablesModule,
    CompanyBrandingModule,
    DocumentsModule,
    BillingModule,
  ],
  controllers: [FinanceReportsController],
  providers: [
    FinanceReportsService,
    AssetPerformanceService,
    FinanceExportService,
    FinanceReportRendererService,
    FinanceReportPdfService,
  ],
  exports: [FinanceReportsService, AssetPerformanceService],
})
export class FinanceReportsModule {}
