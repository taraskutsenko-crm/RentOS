// Explicit `with { type: "json" }` import attributes (TC39 stage-4,
// supported by TS 5.3+/Node 20.10+/modern bundlers) are required here: this
// package is consumed both by apps/web (bundled for the browser — webpack/
// Turbopack resolve JSON imports natively either way) and by apps/api
// (plain Node ESM at runtime, which strictly requires the attribute for
// JSON imports and throws ERR_IMPORT_ATTRIBUTE_MISSING without it).
import cs from "./locales/cs/common.json" with { type: "json" };
import de from "./locales/de/common.json" with { type: "json" };
import en from "./locales/en/common.json" with { type: "json" };
import es from "./locales/es/common.json" with { type: "json" };
import fr from "./locales/fr/common.json" with { type: "json" };
import it from "./locales/it/common.json" with { type: "json" };
import ja from "./locales/ja/common.json" with { type: "json" };
import ko from "./locales/ko/common.json" with { type: "json" };
import nl from "./locales/nl/common.json" with { type: "json" };
import pl from "./locales/pl/common.json" with { type: "json" };
import ptBR from "./locales/pt-BR/common.json" with { type: "json" };
import ru from "./locales/ru/common.json" with { type: "json" };
import uk from "./locales/uk/common.json" with { type: "json" };
import zhCN from "./locales/zh-CN/common.json" with { type: "json" };

/**
 * The single, authoritative locale registry (PRODUCT_BIBLE.md §28, "Global
 * By Design"). Every supported UI language is declared exactly once, here —
 * a language selector, a settings page, validation, or a parity check all
 * read this list rather than maintaining a second copy (see DECISIONS.md
 * D-057). `direction` is `"ltr"` for every currently-shipped locale; the
 * field exists so a future RTL locale (Arabic, Hebrew) is a data addition,
 * not an architecture change — no RTL locale ships today.
 */
export const localeRegistry = [
  { code: "en", englishName: "English", nativeName: "English", direction: "ltr" },
  { code: "de", englishName: "German", nativeName: "Deutsch", direction: "ltr" },
  { code: "es", englishName: "Spanish", nativeName: "Español", direction: "ltr" },
  { code: "pl", englishName: "Polish", nativeName: "Polski", direction: "ltr" },
  { code: "ru", englishName: "Russian", nativeName: "Русский", direction: "ltr" },
  { code: "uk", englishName: "Ukrainian", nativeName: "Українська", direction: "ltr" },
  { code: "fr", englishName: "French", nativeName: "Français", direction: "ltr" },
  { code: "it", englishName: "Italian", nativeName: "Italiano", direction: "ltr" },
  {
    code: "pt-BR",
    englishName: "Portuguese (Brazil)",
    nativeName: "Português (Brasil)",
    direction: "ltr",
  },
  { code: "nl", englishName: "Dutch", nativeName: "Nederlands", direction: "ltr" },
  { code: "cs", englishName: "Czech", nativeName: "Čeština", direction: "ltr" },
  {
    code: "zh-CN",
    englishName: "Chinese (Simplified)",
    nativeName: "简体中文",
    direction: "ltr",
  },
  { code: "ja", englishName: "Japanese", nativeName: "日本語", direction: "ltr" },
  { code: "ko", englishName: "Korean", nativeName: "한국어", direction: "ltr" },
] as const satisfies readonly {
  code: string;
  englishName: string;
  nativeName: string;
  direction: "ltr" | "rtl";
}[];

export type LocaleMetadata = (typeof localeRegistry)[number];

export const supportedLanguages = localeRegistry.map((locale) => locale.code) as [
  (typeof localeRegistry)[number]["code"],
  ...(typeof localeRegistry)[number]["code"][],
];
export type SupportedLanguage = (typeof localeRegistry)[number]["code"];

export const defaultLanguage: SupportedLanguage = "en";

/** i18next-shaped resource bundle — one "common" namespace per language. */
export const resources = {
  en: { common: en },
  ru: { common: ru },
  uk: { common: uk },
  de: { common: de },
  pl: { common: pl },
  es: { common: es },
  fr: { common: fr },
  it: { common: it },
  "pt-BR": { common: ptBR },
  nl: { common: nl },
  cs: { common: cs },
  "zh-CN": { common: zhCN },
  ja: { common: ja },
  ko: { common: ko },
} as const;

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (supportedLanguages as readonly string[]).includes(value);
}

export function getLocaleMetadata(code: SupportedLanguage): LocaleMetadata {
  const found = localeRegistry.find((locale) => locale.code === code);
  if (!found) {
    throw new Error(`No locale metadata registered for "${code}"`);
  }
  return found;
}
