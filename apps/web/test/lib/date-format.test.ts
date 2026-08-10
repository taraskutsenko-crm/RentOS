import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime, formatMonthYear } from "../../src/lib/date-format";

// Noon UTC, not midnight — a date-only ISO string parses as UTC midnight,
// which can render as the *previous* local calendar day on a negative-UTC
// runner (CI may not run in the same timezone as this machine). Noon UTC
// keeps the local calendar date stable across every real-world timezone.
const AUG_10_2026_NOON_UTC = "2026-08-10T12:00:00Z";
const MAR_15_2026_NOON_UTC = "2026-03-15T12:00:00Z";

describe("formatDate", () => {
  it("formats a date using the given locale's own convention", () => {
    // en-US: month/day/year. de-DE: day.month.year. Different digit order
    // proves the `locale` argument actually drives formatting, not just
    // being accepted and ignored.
    expect(formatDate(AUG_10_2026_NOON_UTC, "en-US")).toBe("8/10/2026");
    expect(formatDate(AUG_10_2026_NOON_UTC, "de-DE")).toBe("10.8.2026");
  });

  it("accepts a Date instance as well as a string", () => {
    expect(formatDate(new Date(AUG_10_2026_NOON_UTC), "en-US")).toBe("8/10/2026");
  });
});

describe("formatDateTime", () => {
  it("includes both date and time", () => {
    const formatted = formatDateTime(AUG_10_2026_NOON_UTC, "en-US");
    expect(formatted).toMatch(/2026|26/);
    expect(formatted).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("formatMonthYear", () => {
  it("formats a full month name and year", () => {
    expect(formatMonthYear(AUG_10_2026_NOON_UTC, "en-US")).toBe("August 2026");
  });

  it("uses the target language's own month name, not English, for a non-English locale", () => {
    // German August is spelled identically to English, so use a month that
    // differs — März (March) — to prove the locale is actually applied.
    expect(formatMonthYear(MAR_15_2026_NOON_UTC, "de-DE")).toBe("März 2026");
  });
});
