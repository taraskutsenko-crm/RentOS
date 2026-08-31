import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { PasswordService } from "../auth/password.service";
import { CompanySignatureModule } from "../company-signature/company-signature.module";
import { EmailModule } from "../email/email.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { StorageModule } from "../storage/storage.module";
import { TenantsModule } from "../tenants/tenants.module";
import { DocumentFilesService } from "./document-files.service";
import { DocumentTemplatesController } from "./document-templates.controller";
import { DocumentTemplatesService } from "./document-templates.service";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { DocumentEmailController } from "./email/document-email.controller";
import { DocumentEmailService } from "./email/document-email.service";
import { DocumentPdfService } from "./rendering/document-pdf.service";
import { DocumentRendererService } from "./rendering/document-renderer.service";
import { PdfRendererService } from "./rendering/pdf-renderer.service";
import { VariableResolverService } from "./rendering/variable-resolver.service";
import { DocumentSharingController } from "./sharing/document-sharing.controller";
import { DocumentSharingService } from "./sharing/document-sharing.service";
import { PublicDocumentsController } from "./sharing/public-documents.controller";
import { DOCUMENT_SIGNATURE_PROVIDER } from "./signature/document-signature-provider.types";
import { DocumentSignatureController } from "./signature/document-signature.controller";
import { DocumentSignatureService } from "./signature/document-signature.service";
import { LocalMockSignatureProvider } from "./signature/local-mock-signature.provider";
import { DocumentSignatureEvidenceController } from "./signature-evidence/document-signature-evidence.controller";
import { DocumentSignatureEvidenceService } from "./signature-evidence/document-signature-evidence.service";

@Module({
  imports: [
    TenantsModule,
    AuditModule,
    PermissionsModule,
    StorageModule,
    EmailModule,
    CompanySignatureModule,
  ],
  controllers: [
    DocumentsController,
    DocumentTemplatesController,
    DocumentSharingController,
    PublicDocumentsController,
    DocumentEmailController,
    DocumentSignatureController,
    DocumentSignatureEvidenceController,
  ],
  providers: [
    DocumentsService,
    DocumentFilesService,
    DocumentTemplatesService,
    VariableResolverService,
    DocumentRendererService,
    PdfRendererService,
    DocumentPdfService,
    PasswordService,
    DocumentSharingService,
    DocumentEmailService,
    DocumentSignatureService,
    DocumentSignatureEvidenceService,
    { provide: DOCUMENT_SIGNATURE_PROVIDER, useClass: LocalMockSignatureProvider },
  ],
  exports: [
    DocumentsService,
    DocumentFilesService,
    DocumentTemplatesService,
    DocumentRendererService,
    DocumentPdfService,
    DocumentSharingService,
    DocumentSignatureService,
    DocumentSignatureEvidenceService,
    // Exported so InvoicesModule can reuse the same Puppeteer-backed PDF
    // engine for invoice PDFs (see invoice-pdf.service.ts) instead of
    // launching a second browser instance.
    PdfRendererService,
  ],
})
export class DocumentsModule {}
