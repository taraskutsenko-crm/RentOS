"use client";

import { getLocaleMetadata, type SupportedLanguage } from "@rentos/localization";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { LANGUAGE_STORAGE_KEY } from "../lib/i18n";

/**
 * Keeps `<html lang>` and `<html dir>` in sync with the active i18n language
 * (accessibility/hyphenation/font-selection — see DECISIONS.md D-057) and
 * persists future changes to `localStorage` so a reload keeps the chosen
 * language instead of resetting to English (`lib/i18n.ts` reads the same key
 * on boot). `dir` is sourced from the locale registry's `direction` field —
 * all 14 shipped locales are `ltr` today, but wiring this now means a future
 * RTL locale (Arabic/Hebrew) needs no changes here, only a registry entry.
 */
export function useLanguagePreference(): {
  language: SupportedLanguage;
  setLanguage: (language: SupportedLanguage) => void;
} {
  const { i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = getLocaleMetadata(i18n.language as SupportedLanguage).direction;
  }, [i18n.language]);

  const setLanguage = useCallback(
    (language: SupportedLanguage) => {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
      void i18n.changeLanguage(language);
    },
    [i18n],
  );

  return { language: i18n.language as SupportedLanguage, setLanguage };
}
