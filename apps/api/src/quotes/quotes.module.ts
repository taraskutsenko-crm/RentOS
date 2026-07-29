import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { EmailModule } from "../email/email.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { RentalsModule } from "../rentals/rentals.module";
import { StorageModule } from "../storage/storage.module";
import { TenantsModule } from "../tenants/tenants.module";
import { PublicQuotesController } from "./public-quotes.controller";
import { QuotePdfService } from "./quote-pdf.service";
import { QuotesController } from "./quotes.controller";
import { QuotesService } from "./quotes.service";

@Module({
  imports: [
    TenantsModule,
    AuditModule,
    PermissionsModule,
    RentalsModule,
    StorageModule,
    EmailModule,
  ],
  controllers: [QuotesController, PublicQuotesController],
  providers: [QuotesService, QuotePdfService],
  exports: [QuotesService],
})
export class QuotesModule {}
