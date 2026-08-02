import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

export const CUSTOMER_JWT_SERVICE = Symbol("CUSTOMER_JWT_SERVICE");

export interface CustomerAccessTokenPayload {
  /** Subject — the authenticated customer's id. */
  sub: string;
  tenantId: string;
  /** Distinguishes this token type from a staff access token at a glance during debugging — never relied on for security, the separate signing secret is what actually prevents cross-use. */
  typ: "customer_portal";
}

export interface GeneratedCustomerRefreshToken {
  token: string;
  tokenHash: string;
}

/**
 * Mirrors auth/token.service.ts exactly, except signed with a completely
 * separate JwtService instance (its own JwtModule.registerAsync, bound to
 * JWT_CUSTOMER_ACCESS_SECRET — see CustomerPortalModule) so a customer
 * session token can never be verified as, or confused with, a staff
 * session token even if a call site accidentally used the wrong verifier.
 * See docs/adr/0012-customer-portal.md.
 */
@Injectable()
export class CustomerTokenService {
  constructor(@Inject(CUSTOMER_JWT_SERVICE) private readonly jwtService: JwtService) {}

  signAccessToken(customerId: string, tenantId: string): string {
    const payload: CustomerAccessTokenPayload = {
      sub: customerId,
      tenantId,
      typ: "customer_portal",
    };
    return this.jwtService.sign(payload);
  }

  verifyAccessToken(token: string): CustomerAccessTokenPayload {
    return this.jwtService.verify<CustomerAccessTokenPayload>(token);
  }

  generateRefreshToken(): GeneratedCustomerRefreshToken {
    const token = randomBytes(48).toString("base64url");
    return { token, tokenHash: this.hashToken(token) };
  }

  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
