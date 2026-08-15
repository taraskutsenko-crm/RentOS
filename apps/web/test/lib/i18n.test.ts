import { describe, expect, it } from "vitest";

import { createI18nInstance, resolveSupportedLanguage } from "../../src/lib/i18n";

describe("resolveSupportedLanguage (D-069)", () => {
  it("returns the value as-is when it is one of the 14 supported locales", () => {
    expect(resolveSupportedLanguage("ru")).toBe("ru");
    expect(resolveSupportedLanguage("uk")).toBe("uk");
    expect(resolveSupportedLanguage("en")).toBe("en");
  });

  it("falls back to English for undefined, null, or an unsupported value", () => {
    expect(resolveSupportedLanguage(undefined)).toBe("en");
    expect(resolveSupportedLanguage(null)).toBe("en");
    expect(resolveSupportedLanguage("not-a-locale")).toBe("en");
    expect(resolveSupportedLanguage("")).toBe("en");
  });
});

describe("createI18nInstance (D-069)", () => {
  it("is synchronously ready to translate immediately after creation, in the requested language", () => {
    const instance = createI18nInstance("ru");
    expect(instance.language).toBe("ru");
    // No async gap: resources are statically bundled, so t() works on the
    // very first synchronous call — this is what makes SSR and the client's
    // first paint produce identical output with no second render pass.
    const value = instance.t("app.name");
    expect(value).not.toBe("app.name");
    expect(typeof value).toBe("string");
  });

  it("creates fully independent instances — changing one does not affect another", async () => {
    const a = createI18nInstance("en");
    const b = createI18nInstance("ru");
    expect(a.language).toBe("en");
    expect(b.language).toBe("ru");

    await a.changeLanguage("de");
    expect(a.language).toBe("de");
    expect(b.language).toBe("ru");
  });

  it("supports every one of the 14 registered locales", () => {
    const locales = [
      "en",
      "ru",
      "uk",
      "de",
      "pl",
      "es",
      "fr",
      "it",
      "pt-BR",
      "nl",
      "cs",
      "zh-CN",
      "ja",
      "ko",
    ];
    for (const locale of locales) {
      const instance = createI18nInstance(locale as Parameters<typeof createI18nInstance>[0]);
      expect(instance.language).toBe(locale);
      expect(instance.t("app.name")).not.toBe("app.name");
    }
  });
});
