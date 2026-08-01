import { createHash, randomBytes } from "node:crypto";

/**
 * Mirrors quote-public-token.util.ts exactly (see its own doc comment for
 * the full rationale): an opaque, high-entropy random value is the only
 * thing ever embedded in a public share URL; only its SHA-256 hash is
 * persisted (DocumentShareLink.tokenHash). A database leak alone never
 * exposes a usable public document link.
 */
export interface GeneratedShareToken {
  token: string;
  tokenHash: string;
}

export function generateDocumentShareToken(): GeneratedShareToken {
  const token = randomBytes(48).toString("base64url");
  return { token, tokenHash: hashDocumentShareToken(token) };
}

export function hashDocumentShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
