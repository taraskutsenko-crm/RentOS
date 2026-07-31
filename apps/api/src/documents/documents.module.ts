import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { StorageModule } from "../storage/storage.module";
import { TenantsModule } from "../tenants/tenants.module";
import { DocumentFilesService } from "./document-files.service";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

@Module({
  imports: [TenantsModule, AuditModule, PermissionsModule, StorageModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentFilesService],
  exports: [DocumentsService, DocumentFilesService],
})
export class DocumentsModule {}
