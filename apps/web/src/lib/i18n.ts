"use client";

import { defaultLanguage, isSupportedLanguage, resources } from "@rentos/localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export const LANGUAGE_STORAGE_KEY = "rentos_app_language";

/**
 * A persisted choice always wins over `defaultLanguage` on boot — read
 * synchronously, before `i18n.init()`, so the very first render already
 * uses the saved language instead of flashing English first (see
 * DECISIONS.md D-057: language never persisted before this).
 */
function initialLanguage(): string {
  if (typeof window === "undefined") {
    return defaultLanguage;
  }
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return stored && isSupportedLanguage(stored) ? stored : defaultLanguage;
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: initialLanguage(),
    fallbackLng: defaultLanguage,
    defaultNS: "common",
    interpolation: { escapeValue: false },
  });
}

export default i18n;
