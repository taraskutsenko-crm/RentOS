import { createHash, randomBytes } from "node:crypto";

/**
 * Mirrors auth/token.service.ts's refresh-token convention exactly: an
 * opaque, high-entropy random value is the only thing ever sent to a
 * client; only its SHA-256 hash is persisted (Quote.publicTokenHash). A
 * database leak alone never exposes a usable public quote link. SHA-256
 * (not argon2) is correct here for the same reason it's correct for refresh
 * tokens — this is a 384-bit random value looked up by exact hash, not a
 * low-entropy secret needing deliberately slow hashing.
 */
export interface GeneratedPublicToken {
  /** The opaque, random plain-text token — embedded in the quote link, never stored. */
  token: string;
  /** SHA-256 hash of `token` — what actually gets persisted. */
  tokenHash: string;
}

export function generatePublicQuoteToken(): GeneratedPublicToken {
  const token = randomBytes(48).toString("base64url");
  return { token, tokenHash: hashPublicQuoteToken(token) };
}

export function hashPublicQuoteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
