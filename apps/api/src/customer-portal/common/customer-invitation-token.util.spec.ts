import { describe, expect, it } from "vitest";

import {
  generateCustomerInvitationToken,
  hashCustomerInvitationToken,
} from "./customer-invitation-token.util";

describe("generateCustomerInvitationToken", () => {
  it("generates a high-entropy token distinct from its hash", () => {
    const { token, tokenHash } = generateCustomerInvitationToken();
    expect(token.length).toBeGreaterThan(40);
    expect(tokenHash).not.toBe(token);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex digest
  });

  it("generates a different token on every call", () => {
    const a = generateCustomerInvitationToken();
    const b = generateCustomerInvitationToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });
});

describe("hashCustomerInvitationToken", () => {
  it("is deterministic for the same input", () => {
    const { token, tokenHash } = generateCustomerInvitationToken();
    expect(hashCustomerInvitationToken(token)).toBe(tokenHash);
  });

  it("produces different hashes for different tokens", () => {
    expect(hashCustomerInvitationToken("a")).not.toBe(hashCustomerInvitationToken("b"));
  });
});
