/**
 * S3-compatible storage abstraction. `StorageAdapter` is the only thing a
 * production S3 (or R2/MinIO) implementation needs to satisfy; nothing else
 * in the codebase should import a storage SDK directly. See
 * docs/adr/0005-asset-file-storage-strategy.md.
 */
export interface StorageAdapter {
  /** Writes the object, overwriting any existing object at the same key. */
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Reads the object's full contents. Throws if the key does not exist. */
  read(key: string): Promise<Buffer>;
  /** Deletes the object. A no-op (not an error) if the key does not exist. */
  delete(key: string): Promise<void>;
}

export const STORAGE_ADAPTER = Symbol("STORAGE_ADAPTER");
