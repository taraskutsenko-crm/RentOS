export interface CountryConfig {
  /** ISO 3166-1 alpha-2 country code. */
  code: string;
  /** i18n key resolving to the localized display name — never hardcode the name itself. */
  displayNameKey: string;
  /** ISO 4217 currency code suggested as the tenant default. */
  defaultCurrency: string;
  /** Common IANA time zones for this country, most populous first. */
  timezones: string[];
  /** ISO 639-1 language code suggested as the tenant default. */
  defaultLanguage: string;
}

/**
 * Country configuration foundation. Extended (PRE-CHAPTER-10, see
 * DECISIONS.md D-071) to cover a representative country for every one of
 * the 14 shipped UI locales (`packages/localization`'s `localeRegistry`) —
 * `defaultLanguage` here doubles as the "company's country default
 * business/document language" used to resolve a sensible default Contract
 * language (see `apps/api/src/documents/rendering/document-language-resolver.util.ts`),
 * reusing this single table rather than inventing a second country→language
 * map. Still not a full ISO 3166 list, and no tax-identifier metadata yet.
 */
export const countries: readonly CountryConfig[] = [
  {
    code: "US",
    displayNameKey: "country.US",
    defaultCurrency: "USD",
    timezones: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"],
    defaultLanguage: "en",
  },
  {
    code: "PL",
    displayNameKey: "country.PL",
    defaultCurrency: "PLN",
    timezones: ["Europe/Warsaw"],
    defaultLanguage: "pl",
  },
  {
    code: "DE",
    displayNameKey: "country.DE",
    defaultCurrency: "EUR",
    timezones: ["Europe/Berlin"],
    defaultLanguage: "de",
  },
  {
    code: "UA",
    displayNameKey: "country.UA",
    defaultCurrency: "UAH",
    timezones: ["Europe/Kyiv"],
    defaultLanguage: "uk",
  },
  {
    code: "ES",
    displayNameKey: "country.ES",
    defaultCurrency: "EUR",
    timezones: ["Europe/Madrid", "Atlantic/Canary"],
    defaultLanguage: "es",
  },
  {
    code: "GB",
    displayNameKey: "country.GB",
    defaultCurrency: "GBP",
    timezones: ["Europe/London"],
    defaultLanguage: "en",
  },
  {
    code: "FR",
    displayNameKey: "country.FR",
    defaultCurrency: "EUR",
    timezones: ["Europe/Paris"],
    defaultLanguage: "fr",
  },
  {
    code: "IT",
    displayNameKey: "country.IT",
    defaultCurrency: "EUR",
    timezones: ["Europe/Rome"],
    defaultLanguage: "it",
  },
  {
    code: "NL",
    displayNameKey: "country.NL",
    defaultCurrency: "EUR",
    timezones: ["Europe/Amsterdam"],
    defaultLanguage: "nl",
  },
  {
    code: "CZ",
    displayNameKey: "country.CZ",
    defaultCurrency: "CZK",
    timezones: ["Europe/Prague"],
    defaultLanguage: "cs",
  },
  {
    code: "BR",
    displayNameKey: "country.BR",
    defaultCurrency: "BRL",
    timezones: ["America/Sao_Paulo", "America/Manaus"],
    defaultLanguage: "pt-BR",
  },
  {
    code: "RU",
    displayNameKey: "country.RU",
    defaultCurrency: "RUB",
    timezones: ["Europe/Moscow"],
    defaultLanguage: "ru",
  },
  {
    code: "JP",
    displayNameKey: "country.JP",
    defaultCurrency: "JPY",
    timezones: ["Asia/Tokyo"],
    defaultLanguage: "ja",
  },
  {
    code: "KR",
    displayNameKey: "country.KR",
    defaultCurrency: "KRW",
    timezones: ["Asia/Seoul"],
    defaultLanguage: "ko",
  },
  {
    code: "CN",
    displayNameKey: "country.CN",
    defaultCurrency: "CNY",
    timezones: ["Asia/Shanghai"],
    defaultLanguage: "zh-CN",
  },
] as const;

const countryByCode: ReadonlyMap<string, CountryConfig> = new Map(
  countries.map((country) => [country.code, country]),
);

export function getCountry(code: string): CountryConfig | undefined {
  return countryByCode.get(code);
}

export function isSupportedCountryCode(code: string): boolean {
  return countryByCode.has(code);
}
