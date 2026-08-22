"use client";

import { defaultLanguage, resources, type SupportedLanguage } from "@rentos/localization";
import i18next, { type i18n as I18n } from "i18next";
import { initReactI18next } from "react-i18next";

/**
 * The cookie name/legacy-storage-key constants and resolveSupportedLanguage
 * live in a separate, framework-dependency-free module
 * (`lib/i18n-language.ts`) — layout.tsx (a Server Component) needs to call
 * resolveSupportedLanguage and read LANGUAGE_COOKIE_NAME, and this file
 * cannot be "use client" AND imported by a Server Component: react-i18next's
 * initReactI18next reaches into `React.createContext`, which is unavailable
 * in the server bundle and breaks `next build`'s page-data collection (see
 * DECISIONS.md D-069 addendum) if this whole module is pulled server-side.
 * Re-exported below so every existing `from "lib/i18n"` import keeps working
 * unchanged.
 */
export {
  LANGUAGE_COOKIE_NAME,
  LANGUAGE_STORAGE_KEY,
  resolveSupportedLanguage,
} from "./i18n-language";

const I18N_OPTIONS = {
  resources,
  fallbackLng: defaultLanguage,
  defaultNS: "common",
  interpolation: { escapeValue: false },
} as const;

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
