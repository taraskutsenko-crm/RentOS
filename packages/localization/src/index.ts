import de from "./locales/de/common.json";
import en from "./locales/en/common.json";
import es from "./locales/es/common.json";
import pl from "./locales/pl/common.json";
import ru from "./locales/ru/common.json";
import uk from "./locales/uk/common.json";

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
