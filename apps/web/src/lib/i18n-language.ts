import { defaultLanguage, isSupportedLanguage, type SupportedLanguage } from "@rentos/localization";

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

/** Validates an arbitrary (possibly absent/corrupt) cookie value against the 14 supported locales. */
export function resolveSupportedLanguage(value: string | undefined | null): SupportedLanguage {
  return value && isSupportedLanguage(value) ? value : defaultLanguage;
}
