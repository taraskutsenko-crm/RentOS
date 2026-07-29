// Explicit `with { type: "json" }` import attributes (TC39 stage-4,
// supported by TS 5.3+/Node 20.10+/modern bundlers) are required here: this
// package is consumed both by apps/web (bundled for the browser — webpack/
// Turbopack resolve JSON imports natively either way) and by apps/api
// (plain Node ESM at runtime, which strictly requires the attribute for
// JSON imports and throws ERR_IMPORT_ATTRIBUTE_MISSING without it).
import de from "./locales/de/common.json" with { type: "json" };
import en from "./locales/en/common.json" with { type: "json" };
import es from "./locales/es/common.json" with { type: "json" };
import pl from "./locales/pl/common.json" with { type: "json" };
import ru from "./locales/ru/common.json" with { type: "json" };
import uk from "./locales/uk/common.json" with { type: "json" };

export const supportedLanguages = ["en", "ru", "uk", "de", "pl", "es"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const defaultLanguage: SupportedLanguage = "en";

/** i18next-shaped resource bundle — one "common" namespace per language. */
export const resources = {
  en: { common: en },
  ru: { common: ru },
  uk: { common: uk },
  de: { common: de },
  pl: { common: pl },
  es: { common: es },
} as const;

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (supportedLanguages as readonly string[]).includes(value);
}
