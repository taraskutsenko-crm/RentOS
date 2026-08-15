"use client";

import {
  defaultLanguage,
  isSupportedLanguage,
  resources,
  type SupportedLanguage,
} from "@rentos/localization";
import i18next, { type i18n as I18n } from "i18next";
import { initReactI18next } from "react-i18next";

/**
 * Legacy localStorage key (see DECISIONS.md D-057). No longer written going
 * forward — see D-069 — but still read once, client-side, to migrate any
 * pre-existing user's preference into the new cookie (see
 * use-language-preference.ts). Kept exported for that migration and for
 * existing tests.
 */
export const LANGUAGE_STORAGE_KEY = "rentos_app_language";

/**
 * Cookie name for the persisted UI locale (see DECISIONS.md D-069). Readable
 * by both the server (via `next/headers` `cookies()` in layout.tsx) and the
 * client (via `document.cookie` in use-language-preference.ts), so SSR and
 * client hydration always resolve the same language — the cookie is the
 * single source of truth.
 */
export const LANGUAGE_COOKIE_NAME = "rentos_ui_lang";

const I18N_OPTIONS = {
  resources,
  fallbackLng: defaultLanguage,
  defaultNS: "common",
  interpolation: { escapeValue: false },
} as const;

/** Validates an arbitrary (possibly absent/corrupt) cookie value against the 14 supported locales. */
export function resolveSupportedLanguage(value: string | undefined | null): SupportedLanguage {
  return value && isSupportedLanguage(value) ? value : defaultLanguage;
}

/**
 * Creates a fresh, independent i18next instance pre-initialized with
 * `language` (synchronously ready — no backend plugin, so no async gap
 * between `init()` and `t()` being usable). Used by I18nProvider via
 * `useState(() => createI18nInstance(...))`: React's lazy-initializer runs
 * once per component instance, which means once per SSR request (isolating
 * concurrent requests for different tenants/users from each other — a
 * shared mutable singleton mutated via `changeLanguage()` during SSR would
 * otherwise let concurrent requests race and cross-contaminate rendered
 * output) and once per client session (a natural long-lived singleton for
 * the browser tab, preserving prior UX).
 */
export function createI18nInstance(language: SupportedLanguage): I18n {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({ ...I18N_OPTIONS, lng: language });
  return instance;
}

/**
 * Module-singleton instance, initialized to `defaultLanguage` unconditionally
 * on both server and client. The real app no longer renders against this
 * instance (see I18nProvider, which uses `createI18nInstance` instead) — it
 * exists solely so the large number of existing tests that do
 * `import i18n from "lib/i18n"` and wrap components in
 * `<I18nextProvider i18n={i18n}>` keep working unchanged.
 */
const i18n: I18n = i18next.createInstance();
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({ ...I18N_OPTIONS, lng: defaultLanguage });
}

export default i18n;
