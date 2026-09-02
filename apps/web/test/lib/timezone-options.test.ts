import { describe, expect, it } from "vitest";

import {
  buildTimezoneOptions,
  formatUtcOffsetLabel,
  getTimezoneCityLabel,
  groupTimezoneOptionsByOffset,
  searchTimezoneOptions,
  timezoneOptionMatchesQuery,
} from "@rentos/shared";

// Task A: canonical IANA storage + honest, DST-correct UTC offset display —
// see packages/shared/src/timezone-options.ts's own doc comment. These
// tests exercise the real runtime timezone database (Intl.supportedValuesOf),
// never a hand-maintained offset table.

describe("formatUtcOffsetLabel", () => {
  it("formats positive, negative, and zero offsets with a sign and HH:MM", () => {
    expect(formatUtcOffsetLabel(120)).toBe("UTC+02:00");
    expect(formatUtcOffsetLabel(-240)).toBe("UTC-04:00");
    expect(formatUtcOffsetLabel(0)).toBe("UTC+00:00");
    expect(formatUtcOffsetLabel(0, { zeroSign: "±" })).toBe("UTC±00:00");
  });

  it("formats fractional (non-hour) offsets correctly", () => {
    expect(formatUtcOffsetLabel(330)).toBe("UTC+05:30"); // Asia/Kolkata
    expect(formatUtcOffsetLabel(345)).toBe("UTC+05:45"); // Asia/Kathmandu
    expect(formatUtcOffsetLabel(570)).toBe("UTC+09:30"); // Australia/Adelaide (standard time)
  });
});

describe("getTimezoneCityLabel", () => {
  it("derives a human label from the IANA id's final segment", () => {
    expect(getTimezoneCityLabel("Europe/Warsaw")).toBe("Warsaw");
    expect(getTimezoneCityLabel("America/New_York")).toBe("New York");
    expect(getTimezoneCityLabel("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
  });
});

describe("buildTimezoneOptions", () => {
  const options = buildTimezoneOptions(new Date("2026-07-01T12:00:00Z"));

  it("includes real IANA zones from the runtime, not a hand-picked list", () => {
    const values = options.map((o) => o.value);
    for (const zone of [
      "Europe/Warsaw",
      "Europe/London",
      "America/New_York",
      "America/Los_Angeles",
      "Asia/Dubai",
      "Asia/Tokyo",
      "Australia/Adelaide",
    ]) {
      expect(values).toContain(zone);
    }
    // India/Nepal: some runtimes' tzdata report the legacy canonical
    // spelling (Asia/Calcutta/Asia/Katmandu) rather than the modern IANA
    // name (Asia/Kolkata/Asia/Kathmandu) — both are real, equally valid
    // identifiers for the same zone (see SEARCH_ALIASES's own doc
    // comment), so assert on whichever this runtime actually returns
    // rather than a single hardcoded spelling.
    expect(values.some((v) => v === "Asia/Kolkata" || v === "Asia/Calcutta")).toBe(true);
    expect(values.some((v) => v === "Asia/Kathmandu" || v === "Asia/Katmandu")).toBe(true);
  });

  it("shows the real current UTC offset for each option (July — Warsaw in DST)", () => {
    const warsaw = options.find((o) => o.value === "Europe/Warsaw")!;
    expect(warsaw.offsetMinutes).toBe(120);
    expect(warsaw.offsetLabel).toBe("+02:00");
    expect(warsaw.displayLabel).toBe("UTC+02:00 — Warsaw");
  });

  it("shows fractional offsets correctly for India (+05:30) and Nepal (+05:45)", () => {
    const india = options.find((o) => o.value === "Asia/Kolkata" || o.value === "Asia/Calcutta")!;
    expect(india.offsetLabel).toBe("+05:30");
    const nepal = options.find((o) => o.value === "Asia/Kathmandu" || o.value === "Asia/Katmandu")!;
    expect(nepal.offsetLabel).toBe("+05:45");
  });

  it("never hardcodes DST — Warsaw's offset differs between summer and winter", () => {
    const summer = buildTimezoneOptions(new Date("2026-07-01T12:00:00Z")).find(
      (o) => o.value === "Europe/Warsaw",
    )!;
    const winter = buildTimezoneOptions(new Date("2026-01-15T12:00:00Z")).find(
      (o) => o.value === "Europe/Warsaw",
    )!;
    expect(summer.offsetMinutes).toBe(120); // UTC+2 (CEST)
    expect(winter.offsetMinutes).toBe(60); // UTC+1 (CET)
  });

  it("never hardcodes DST — New York's offset differs between summer and winter", () => {
    const summer = buildTimezoneOptions(new Date("2026-07-01T12:00:00Z")).find(
      (o) => o.value === "America/New_York",
    )!;
    const winter = buildTimezoneOptions(new Date("2026-01-15T12:00:00Z")).find(
      (o) => o.value === "America/New_York",
    )!;
    expect(summer.offsetMinutes).toBe(-240); // UTC-4 (EDT)
    expect(winter.offsetMinutes).toBe(-300); // UTC-5 (EST)
  });
});

describe("groupTimezoneOptionsByOffset", () => {
  const options = buildTimezoneOptions(new Date("2026-07-01T12:00:00Z"));
  const groups = groupTimezoneOptionsByOffset(options);

  it("sorts groups ascending by offset (west to east)", () => {
    const offsets = groups.map((g) => g.offsetMinutes);
    const sorted = [...offsets].sort((a, b) => a - b);
    expect(offsets).toEqual(sorted);
  });

  it("groups zones that currently share an offset together, each still its own IANA id", () => {
    const utc2Group = groups.find((g) => g.offsetMinutes === 120)!;
    const values = utc2Group.options.map((o) => o.value);
    expect(values).toContain("Europe/Warsaw");
    expect(values).toContain("Europe/Berlin");
    expect(values).toContain("Europe/Paris");
    // Never collapsed into one canonical zone — each remains separately selectable.
    expect(new Set(values).size).toBe(values.length);
  });

  it("sorts options within a group alphabetically by label", () => {
    const utc2Group = groups.find((g) => g.offsetMinutes === 120)!;
    const labels = utc2Group.options.map((o) => o.label);
    const sorted = [...labels].sort((a, b) => a.localeCompare(b));
    expect(labels).toEqual(sorted);
  });

  it("labels the zero-offset group with the ± convention", () => {
    const zeroGroup = groups.find((g) => g.offsetMinutes === 0)!;
    expect(zeroGroup.groupLabel).toBe("UTC±00:00");
  });
});

describe("timezoneOptionMatchesQuery / searchTimezoneOptions", () => {
  const options = buildTimezoneOptions(new Date("2026-07-01T12:00:00Z"));

  it("matches a city name", () => {
    const results = searchTimezoneOptions(options, "Warsaw");
    expect(results.map((o) => o.value)).toContain("Europe/Warsaw");
  });

  it("matches a country alias not present in the IANA id", () => {
    const results = searchTimezoneOptions(options, "Poland");
    expect(results.map((o) => o.value)).toContain("Europe/Warsaw");
  });

  it("matches the raw IANA identifier typed directly", () => {
    const results = searchTimezoneOptions(options, "Europe/Warsaw");
    expect(results.map((o) => o.value)).toEqual(["Europe/Warsaw"]);
  });

  it("matches a '+2' / 'UTC+2' offset query against every zone currently at that offset", () => {
    for (const query of ["+2", "UTC+2", "UTC+02", "UTC+02:00"]) {
      const results = searchTimezoneOptions(options, query);
      expect(results.map((o) => o.value)).toContain("Europe/Warsaw");
      expect(results.every((o) => o.offsetMinutes === 120)).toBe(true);
    }
  });

  it("matches a '-4' offset query against New York in July (EDT = UTC-4)", () => {
    const results = searchTimezoneOptions(options, "-4");
    expect(results.map((o) => o.value)).toContain("America/New_York");
  });

  it("matches 'Kolkata' (India) and 'Kathmandu' (Nepal) regardless of which canonical spelling the runtime uses", () => {
    expect(searchTimezoneOptions(options, "Kolkata").length).toBeGreaterThan(0);
    expect(searchTimezoneOptions(options, "Kathmandu").length).toBeGreaterThan(0);
    expect(searchTimezoneOptions(options, "India").length).toBeGreaterThan(0);
    expect(searchTimezoneOptions(options, "Nepal").length).toBeGreaterThan(0);
  });

  it("matches 'New York' by city name", () => {
    const results = searchTimezoneOptions(options, "New York");
    expect(results.map((o) => o.value)).toEqual(["America/New_York"]);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(timezoneOptionMatchesQuery(options.find((o) => o.value === "Europe/Warsaw")!, "  wArSaW  ")).toBe(
      true,
    );
  });

  it("an empty query matches everything", () => {
    expect(searchTimezoneOptions(options, "")).toHaveLength(options.length);
  });
});
