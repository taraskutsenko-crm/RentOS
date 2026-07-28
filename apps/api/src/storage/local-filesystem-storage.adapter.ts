import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnv } from "@rentos/shared";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";

import type { StorageAdapter } from "./storage.types";

/**
 * Local-development / test storage adapter: writes objects under a single
 * directory on disk. Keys are always generated server-side (see
 * AssetFilesService) as `tenants/<tenantId>/assets/<assetId>/...`, so this
 * never trusts a caller-supplied path — but it still normalizes and
 * verifies every resolved path stays within the storage root as defense in
 * depth against path traversal.
 */
@Injectable()
export class LocalFilesystemStorageAdapter implements StorageAdapter {
  private readonly root: string;

  constructor(configService: ConfigService<ApiEnv, true>) {
    this.root = resolve(configService.get("STORAGE_LOCAL_DIR", { infer: true }));
  }

  async put(key: string, data: Buffer, _contentType: string): Promise<void> {
    const filePath = this.resolveKey(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  private resolveKey(key: string): string {
    const filePath = resolve(this.root, normalize(join(".", key)));
    if (!filePath.startsWith(this.root)) {
      throw new Error("Invalid storage key");
    }
    return filePath;
  }
}
