import { createHash, randomBytes } from "node:crypto";

/**
 * Mirrors quote-public-token.util.ts / document-share-token.util.ts /
 * auth/token.service.ts's refresh-token convention exactly: an opaque,
 * high-entropy random value is the only thing ever sent to a client (here,
 * embedded in the invitation link); only its SHA-256 hash is persisted
 * (Customer.portalInvitationTokenHash). A database leak alone never
 * exposes a usable invitation link.
 */
export interface GeneratedCustomerInvitationToken {
  /** The opaque, random plain-text token — embedded in the invite link, never stored. */
  token: string;
  /** SHA-256 hash of `token` — what actually gets persisted. */
  tokenHash: string;
}

export function generateCustomerInvitationToken(): GeneratedCustomerInvitationToken {
  const token = randomBytes(48).toString("base64url");
  return { token, tokenHash: hashCustomerInvitationToken(token) };
}

export function hashCustomerInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
