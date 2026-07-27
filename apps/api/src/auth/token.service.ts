import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

export interface AccessTokenPayload {
  /** Subject — the authenticated user's id. */
  sub: string;
}

export interface GeneratedRefreshToken {
  /** The opaque, random plain-text token — sent to the client, never stored. */
  token: string;
  /** SHA-256 hash of `token` — what actually gets persisted. */
  tokenHash: string;
}

/**
 * Access tokens are short-lived signed JWTs (stateless, verified via
 * signature). Refresh tokens are opaque random values: only their SHA-256
 * hash is ever persisted, so a database leak does not expose usable tokens.
 * SHA-256 (fast, deterministic) is used here rather than argon2 (slow,
 * salted) because refresh tokens are high-entropy random values looked up
 * by exact hash on every request — argon2's deliberate slowness is for
 * resisting offline brute-force of low-entropy secrets (passwords), which
 * does not apply to a 384-bit random token.
 */
@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  signAccessToken(userId: string): string {
    const payload: AccessTokenPayload = { sub: userId };
    return this.jwtService.sign(payload);
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwtService.verify<AccessTokenPayload>(token);
  }

  generateRefreshToken(): GeneratedRefreshToken {
    const token = randomBytes(48).toString("base64url");
    return { token, tokenHash: this.hashToken(token) };
  }

  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
