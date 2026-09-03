import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { BillingModule } from "../billing/billing.module";
import { DocumentsModule } from "../documents/documents.module";
import { EmailModule } from "../email/email.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { StorageModule } from "../storage/storage.module";
import { TenantsModule } from "../tenants/tenants.module";
import { PaymentDemandEmailService } from "./payment-demand-email.service";
import { PaymentDemandsController } from "./payment-demands.controller";
import { PaymentDemandsService } from "./payment-demands.service";
import { PaymentDemandPdfService } from "./rendering/payment-demand-pdf.service";
import { PaymentDemandRendererService } from "./rendering/payment-demand-renderer.service";

@Module({
  imports: [
    TenantsModule,
    AuditModule,
    PermissionsModule,
    DocumentsModule,
    EmailModule,
    StorageModule,
    BillingModule,
  ],
  controllers: [PaymentDemandsController],
  providers: [
    PaymentDemandsService,
    PaymentDemandRendererService,
    PaymentDemandPdfService,
    PaymentDemandEmailService,
  ],
  exports: [PaymentDemandsService],
})
export class PaymentDemandsModule {}
