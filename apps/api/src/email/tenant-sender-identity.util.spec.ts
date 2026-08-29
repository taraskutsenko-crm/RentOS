import { describe, expect, it } from "vitest";

import {
  buildTenantFromName,
  resolveTenantReplyTo,
  stripControlChars,
} from "./tenant-sender-identity.util";

describe("buildTenantFromName", () => {
  it("appends 'via Havelio' to a real tenant name", () => {
    expect(buildTenantFromName("Closure Pass Rentals")).toBe("Closure Pass Rentals via Havelio");
  });

  it("falls back to plain Havelio when the tenant name is null", () => {
    expect(buildTenantFromName(null)).toBe("Havelio");
  });

  it("falls back to plain Havelio when the tenant name is undefined", () => {
    expect(buildTenantFromName(undefined)).toBe("Havelio");
  });

  it("falls back to plain Havelio when the tenant name is an empty string", () => {
    expect(buildTenantFromName("")).toBe("Havelio");
  });

  it("falls back to plain Havelio when the tenant name is only whitespace", () => {
    expect(buildTenantFromName("   ")).toBe("Havelio");
  });

  it("never produces 'undefined via Havelio'", () => {
    expect(buildTenantFromName(undefined)).not.toContain("undefined");
  });

  it("never produces 'null via Havelio'", () => {
    expect(buildTenantFromName(null)).not.toContain("null");
  });

  it("preserves legitimate Unicode characters in the tenant name", () => {
    expect(buildTenantFromName("Wynajem Sprzętu Kraków Sp. z o.o.")).toBe(
      "Wynajem Sprzętu Kraków Sp. z o.o. via Havelio",
    );
    expect(buildTenantFromName("株式会社レンタル")).toBe("株式会社レンタル via Havelio");
    expect(buildTenantFromName("Аренда Техники ООО")).toBe("Аренда Техники ООО via Havelio");
  });

  it("strips CR/LF so a malicious tenant name cannot inject extra mail headers", () => {
    const malicious = "Evil Co\r\nBcc: attacker@evil.com";
    const result = buildTenantFromName(malicious);
    expect(result).not.toMatch(/[\r\n]/);
    expect(result).toBe("Evil CoBcc: attacker@evil.com via Havelio");
  });

  it("strips NUL and other control characters", () => {
    const result = buildTenantFromName("Bad\x00Name\x1F");
    // eslint-disable-next-line no-control-regex -- asserting control chars are gone
    expect(result).not.toMatch(/[\x00-\x1F\x7F]/);
    expect(result).toBe("BadName via Havelio");
  });

  it("truncates an unreasonably long tenant name rather than emitting an unbounded header", () => {
    const longName = "A".repeat(500);
    const result = buildTenantFromName(longName);
    expect(result.length).toBeLessThanOrEqual(200 + " via Havelio".length);
  });
});

describe("resolveTenantReplyTo", () => {
  it("returns the tenant's email when it is syntactically valid", () => {
    expect(resolveTenantReplyTo("office@closurepassrentals.com")).toBe(
      "office@closurepassrentals.com",
    );
  });

  it("returns undefined (Reply-To omitted) when the tenant has no email on file", () => {
    expect(resolveTenantReplyTo(null)).toBeUndefined();
    expect(resolveTenantReplyTo(undefined)).toBeUndefined();
    expect(resolveTenantReplyTo("")).toBeUndefined();
  });

  it("returns undefined for a malformed email rather than fabricating or throwing", () => {
    expect(resolveTenantReplyTo("not-an-email")).toBeUndefined();
    expect(resolveTenantReplyTo("missing-domain@")).toBeUndefined();
    expect(resolveTenantReplyTo("@missing-local.com")).toBeUndefined();
  });

  it("returns undefined for a value containing CR/LF, even if it looks otherwise like an email", () => {
    expect(resolveTenantReplyTo("office@company.com\r\nBcc: attacker@evil.com")).toBeUndefined();
  });

  it("never returns a second tenant's identity — pure function, no shared state between calls", () => {
    const tenantAEmail = resolveTenantReplyTo("office@company-a.com");
    const tenantBEmail = resolveTenantReplyTo("office@company-b.com");
    expect(tenantAEmail).toBe("office@company-a.com");
    expect(tenantBEmail).toBe("office@company-b.com");
    // Re-resolving A after B must still yield A — proves no cross-call state leak.
    expect(resolveTenantReplyTo("office@company-a.com")).toBe("office@company-a.com");
  });
});

describe("stripControlChars", () => {
  it("removes CR, LF, and NUL", () => {
    expect(stripControlChars("a\r\nb\x00c")).toBe("abc");
  });

  it("leaves ordinary and Unicode text untouched", () => {
    expect(stripControlChars("Closure Pass Rentals — Kraków")).toBe(
      "Closure Pass Rentals — Kraków",
    );
  });
});
