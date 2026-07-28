/**
 * A practical subset of active ISO 4217 currency codes — the major world
 * currencies plus every currency already reachable via `countries.ts`. Not
 * the full ISO 4217 registry (180+ codes); extend as new tenant countries
 * are added. Used to validate Asset.purchaseCurrency / replacementCurrency
 * (see docs/adr — money is always stored as integer minor units + an ISO
 * 4217 code, never floating point).
 */
export const SUPPORTED_CURRENCY_CODES: readonly string[] = [
  "USD",
  "EUR",
  "GBP",
  "PLN",
  "UAH",
  "JPY",
  "CHF",
  "CAD",
  "AUD",
  "CNY",
  "SEK",
  "NOK",
  "DKK",
  "CZK",
  "HUF",
  "RON",
  "TRY",
  "ILS",
  "AED",
  "SAR",
  "INR",
  "BRL",
  "MXN",
  "ZAR",
  "KRW",
  "SGD",
  "HKD",
  "NZD",
  "THB",
  "IDR",
  "MYR",
  "PHP",
  "VND",
  "RSD",
  "GEL",
  "KZT",
  "BYN",
  "MDL",
  "AMD",
  "AZN",
  "UZS",
] as const;

const currencyCodeSet: ReadonlySet<string> = new Set(SUPPORTED_CURRENCY_CODES);

export function isSupportedCurrencyCode(code: string): boolean {
  return currencyCodeSet.has(code.toUpperCase());
}
