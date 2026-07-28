import { Module } from "@nestjs/common";

import { LocalFilesystemStorageAdapter } from "./local-filesystem-storage.adapter";
import { StorageService } from "./storage.service";
import { STORAGE_ADAPTER } from "./storage.types";

@Module({
  providers: [
    { provide: STORAGE_ADAPTER, useClass: LocalFilesystemStorageAdapter },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
