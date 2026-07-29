import { describe, expect, it } from "vitest";

import { generatePublicQuoteToken, hashPublicQuoteToken } from "./quote-public-token.util";

describe("generatePublicQuoteToken", () => {
  it("generates a high-entropy token distinct from its hash", () => {
    const { token, tokenHash } = generatePublicQuoteToken();
    expect(token.length).toBeGreaterThan(40);
    expect(tokenHash).not.toBe(token);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex digest
  });

  it("generates a different token on every call", () => {
    const a = generatePublicQuoteToken();
    const b = generatePublicQuoteToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });
});

describe("hashPublicQuoteToken", () => {
  it("is deterministic for the same input", () => {
    const { token, tokenHash } = generatePublicQuoteToken();
    expect(hashPublicQuoteToken(token)).toBe(tokenHash);
  });

  it("produces different hashes for different tokens", () => {
    expect(hashPublicQuoteToken("a")).not.toBe(hashPublicQuoteToken("b"));
  });
});
