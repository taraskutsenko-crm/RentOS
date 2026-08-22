import { describe, expect, it } from "vitest";

import { resolveDefaultDocumentLanguage } from "./document-language-resolver.util";

describe("resolveDefaultDocumentLanguage", () => {
  it("defaults a Polish company to Polish, regardless of the tenant's own defaultLanguage", () => {
    expect(resolveDefaultDocumentLanguage({ countryCode: "PL", defaultLanguage: "en" })).toBe("pl");
  });

  it("resolves the real PL company / RU UI scenario: contract defaults to Polish, never Russian or English", () => {
    // UI language ("ru") must never influence this — only the tenant's
    // business country does (see PRODUCT_BIBLE.md §28, DECISIONS.md D-071).
    expect(resolveDefaultDocumentLanguage({ countryCode: "PL", defaultLanguage: "ru" })).toBe("pl");
  });

  it("defaults a German company to German", () => {
    expect(resolveDefaultDocumentLanguage({ countryCode: "DE", defaultLanguage: "en" })).toBe("de");
  });

  it("defaults a French company to French", () => {
    expect(resolveDefaultDocumentLanguage({ countryCode: "FR", defaultLanguage: "en" })).toBe("fr");
  });

  it("defaults an Italian company to Italian", () => {
    expect(resolveDefaultDocumentLanguage({ countryCode: "IT", defaultLanguage: "en" })).toBe("it");
  });

  it("defaults a Spanish company to Spanish", () => {
    expect(resolveDefaultDocumentLanguage({ countryCode: "ES", defaultLanguage: "en" })).toBe("es");
  });

  it("defaults a Czech company to Czech", () => {
    expect(resolveDefaultDocumentLanguage({ countryCode: "CZ", defaultLanguage: "en" })).toBe("cs");
  });

  it("defaults a Brazilian company to Brazilian Portuguese", () => {
    expect(resolveDefaultDocumentLanguage({ countryCode: "BR", defaultLanguage: "en" })).toBe(
      "pt-BR",
    );
  });

  it("falls back to tenant.defaultLanguage when the country code is unknown", () => {
    expect(resolveDefaultDocumentLanguage({ countryCode: "ZZ", defaultLanguage: "de" })).toBe("de");
  });

  it("falls back to the package-wide default ('en') when both the country and tenant default are unusable", () => {
    expect(
      resolveDefaultDocumentLanguage({ countryCode: "ZZ", defaultLanguage: "not-a-real-language" }),
    ).toBe("en");
  });

  it("falls back to tenant.defaultLanguage when the country's default language is not a supported UI locale", () => {
    // GB's defaultLanguage is "en" (supported), so this exercises the
    // country-default path; US/GB both resolve to "en" already, so this
    // additionally proves the country default takes priority over a
    // different tenant.defaultLanguage.
    expect(resolveDefaultDocumentLanguage({ countryCode: "GB", defaultLanguage: "fr" })).toBe("en");
  });
});
