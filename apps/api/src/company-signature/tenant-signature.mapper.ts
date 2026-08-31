import type { TenantSignature } from "@prisma/client";

/**
 * `storageKey` is an internal implementation detail (the R2/S3 object
 * path) — never returned to any client (docs/PRODUCT_BIBLE.md "Havelio
 * Signature System", "no raw storage URL/path leakage"). Same
 * strip-before-respond convention as `toPublicUser`/`toPublicCustomer`.
 */
export type PublicTenantSignature = Omit<TenantSignature, "storageKey">;

export function toPublicTenantSignature(signature: TenantSignature): PublicTenantSignature {
  const { storageKey: _storageKey, ...publicSignature } = signature;
  return publicSignature;
}
