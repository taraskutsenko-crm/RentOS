import { describe, expect, it } from "vitest";

import {
  getLocaleMetadata,
  isSupportedLanguage,
  localeRegistry,
  supportedLanguages,
} from "@rentos/localization";

describe("localeRegistry", () => {
  it("supports exactly the 14 production UI locales", () => {
    expect(localeRegistry).toHaveLength(14);
    expect(supportedLanguages).toHaveLength(14);
    expect(new Set(supportedLanguages)).toEqual(
      new Set([
        "en",
        "pl",
        "de",
        "uk",
        "ru",
        "es",
        "fr",
        "it",
        "pt-BR",
        "nl",
        "cs",
        "zh-CN",
        "ja",
        "ko",
      ]),
    );
  });

  it("gives every locale a unique code, an English name, and a non-empty native name", () => {
    const codes = localeRegistry.map((locale) => locale.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const locale of localeRegistry) {
      expect(locale.englishName.length).toBeGreaterThan(0);
      expect(locale.nativeName.length).toBeGreaterThan(0);
    }
  });

  it("marks all 14 shipped locales as left-to-right (no RTL locale added yet)", () => {
    for (const locale of localeRegistry) {
      expect(locale.direction).toBe("ltr");
    }
  });

  it("uses a well-formed BCP-47 tag as its code (consumed directly by Intl.*)", () => {
    for (const locale of localeRegistry) {
      // Throws RangeError if the tag isn't well-formed — the same check
      // Intl.DateTimeFormat/NumberFormat perform internally when a
      // component passes `locale.code` straight through as the locale arg.
      expect(() => new Intl.Locale(locale.code)).not.toThrow();
    }
  });
});

describe("isSupportedLanguage", () => {
  it("accepts every registered code", () => {
    for (const code of supportedLanguages) {
      expect(isSupportedLanguage(code)).toBe(true);
    }
  });

  it("rejects codes that aren't registered", () => {
    expect(isSupportedLanguage("ar")).toBe(false);
    expect(isSupportedLanguage("he")).toBe(false);
    expect(isSupportedLanguage("")).toBe(false);
  });
});

describe("getLocaleMetadata", () => {
  it("returns the matching registry entry", () => {
    const metadata = getLocaleMetadata("zh-CN");
    expect(metadata.code).toBe("zh-CN");
    expect(metadata.direction).toBe("ltr");
  });

  it("throws for an unregistered code rather than returning undefined", () => {
    // @ts-expect-error - deliberately passing an unsupported code
    expect(() => getLocaleMetadata("ar")).toThrow();
  });
});
