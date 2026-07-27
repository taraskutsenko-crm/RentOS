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
 * Minimal country configuration foundation. Deliberately small (6 entries)
 * for this task — not a full ISO 3166 list, and no tax-identifier metadata
 * yet (a later task).
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
