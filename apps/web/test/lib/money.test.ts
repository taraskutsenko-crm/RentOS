import { describe, expect, it } from "vitest";

import { formatMoney, fromMinorUnits, toMinorUnits } from "../../src/lib/money";

describe("toMinorUnits", () => {
  it("converts a major-unit display string to integer minor units", () => {
    expect(toMinorUnits("1234.56")).toBe(123456);
    expect(toMinorUnits("10")).toBe(1000);
    expect(toMinorUnits("0.01")).toBe(1);
  });

  it("returns undefined for an empty string", () => {
    expect(toMinorUnits("")).toBeUndefined();
    expect(toMinorUnits("   ")).toBeUndefined();
  });

  it("returns undefined for a non-numeric string", () => {
    expect(toMinorUnits("abc")).toBeUndefined();
  });

  it("rounds to avoid floating-point drift", () => {
    // 1.005 * 100 in raw floating point is 100.49999999999999 — verify we
    // still land on a clean integer via Math.round, not silent truncation.
    expect(toMinorUnits("19.99")).toBe(1999);
    expect(Number.isInteger(toMinorUnits("19.99"))).toBe(true);
  });
});

describe("fromMinorUnits", () => {
  it("converts integer minor units back to a 2-decimal display string", () => {
    expect(fromMinorUnits(123456)).toBe("1234.56");
    expect(fromMinorUnits(1)).toBe("0.01");
  });

  it("returns an empty string for null/undefined", () => {
    expect(fromMinorUnits(null)).toBe("");
    expect(fromMinorUnits(undefined)).toBe("");
  });

  it("round-trips through toMinorUnits", () => {
    expect(toMinorUnits(fromMinorUnits(999999))).toBe(999999);
  });
});

describe("formatMoney", () => {
  it("formats minor units with the given currency", () => {
    // Locale-agnostic: the test environment's default ICU locale varies by
    // machine, so assert on the normalized digits/currency rather than one
    // specific grouping/decimal separator convention.
    const formatted = formatMoney(123456, "USD");
    expect(formatted.replace(/[^0-9]/g, "")).toBe("123456");
    expect(formatted).toMatch(/\$|USD/);
  });

  it("returns an em dash when either value is missing", () => {
    expect(formatMoney(null, "USD")).toBe("—");
    expect(formatMoney(1000, null)).toBe("—");
  });
});
