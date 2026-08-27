import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import type { ApiEnv } from "@rentos/shared";

import { PermissionsModule } from "../permissions/permissions.module";
import { TenantsModule } from "../tenants/tenants.module";
import { LocalFilesystemStorageAdapter } from "./local-filesystem-storage.adapter";
import { S3StorageAdapter } from "./s3-storage.adapter";
import { StorageUsageController } from "./storage-usage.controller";
import { StorageUsageService } from "./storage-usage.service";
import { StorageService } from "./storage.service";
import { STORAGE_ADAPTER } from "./storage.types";

/**
 * STORAGE_DRIVER selects the bound StorageAdapter implementation — "local"
 * (default) or "s3" (any S3-compatible provider). This is the one place in
 * the codebase that decides which adapter is live; every caller only ever
 * sees StorageService (see ADR 0005 / docs/adr/0013-production-storage-and-email.md).
 */
@Module({
  imports: [ConfigModule, TenantsModule, PermissionsModule],
  controllers: [StorageUsageController],
  providers: [
    {
      provide: STORAGE_ADAPTER,
      useFactory: (configService: ConfigService<ApiEnv, true>) => {
        const driver = configService.get("STORAGE_DRIVER", { infer: true });
        return driver === "s3"
          ? new S3StorageAdapter(configService)
          : new LocalFilesystemStorageAdapter(configService);
      },
      inject: [ConfigService],
    },
    StorageService,
    StorageUsageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
