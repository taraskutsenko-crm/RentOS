import type { DocumentSignatureEvidence } from "@prisma/client";

/**
 * `storageKey` is an internal implementation detail (the R2/S3 object
 * path) — never returned to any client (docs/PRODUCT_BIBLE.md "Havelio
 * Signature System", "no raw storage URL/path leakage"). Same
 * strip-before-respond convention as `toPublicUser`/`toPublicCustomer`/
 * `toPublicTenantSignature`.
 */
export type PublicDocumentSignatureEvidence = Omit<DocumentSignatureEvidence, "storageKey">;

export function toPublicSignatureEvidence(
  evidence: DocumentSignatureEvidence,
): PublicDocumentSignatureEvidence {
  const { storageKey: _storageKey, ...publicEvidence } = evidence;
  return publicEvidence;
}
