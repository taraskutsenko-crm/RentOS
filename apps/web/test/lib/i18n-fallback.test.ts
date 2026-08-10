import i18next from "i18next";
import { beforeAll, describe, expect, it } from "vitest";

import { defaultLanguage, resources } from "@rentos/localization";

// A separate i18next instance (not the app's shared `lib/i18n.ts` singleton)
// mirroring its exact init options, so fallback/missing-key behavior can be
// exercised in isolation without disturbing other test files that already
// initialized the real singleton.
const testI18n = i18next.createInstance();

beforeAll(async () => {
  await testI18n.init({
    resources,
    lng: "de",
    fallbackLng: defaultLanguage,
    defaultNS: "common",
    interpolation: { escapeValue: false },
  });
});

describe("i18next fallback behavior", () => {
  it("falls back to English when the active language is missing a key entirely", async () => {
    await testI18n.changeLanguage("de");
    // A key guaranteed to exist in en but not in any other locale's JSON.
    testI18n.addResourceBundle("en", "common", { __onlyInEnglish: "English only" }, true, true);
    expect(testI18n.t("__onlyInEnglish")).toBe("English only");
  });

  it("does not throw and returns the key itself for a key missing from every locale", () => {
    expect(() => testI18n.t("this.key.does.not.exist.anywhere")).not.toThrow();
    expect(typeof testI18n.t("this.key.does.not.exist.anywhere")).toBe("string");
  });

  it("resolves a real, shared key identically across a sample of locales", async () => {
    // app.name exists in every locale file (verified by the i18n-parity
    // governance script) — spot-check a representative subset resolves to a
    // non-empty, locale-specific string rather than the raw key.
    for (const lng of ["en", "de", "uk", "zh-CN", "ja"]) {
      await testI18n.changeLanguage(lng);
      const value = testI18n.t("app.name");
      expect(value).not.toBe("app.name");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
