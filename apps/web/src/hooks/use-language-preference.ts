"use client";

import {
  getLocaleMetadata,
  isSupportedLanguage,
  type SupportedLanguage,
} from "@rentos/localization";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { LANGUAGE_COOKIE_NAME, LANGUAGE_STORAGE_KEY } from "../lib/i18n";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function readLanguageCookie(): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${LANGUAGE_COOKIE_NAME}=([^;]*)`));
  return match?.[1] !== undefined ? decodeURIComponent(match[1]) : undefined;
}

function writeLanguageCookie(language: SupportedLanguage): void {
  document.cookie = `${LANGUAGE_COOKIE_NAME}=${language}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function useLanguagePreference(): {
  language: SupportedLanguage;
  setLanguage: (language: SupportedLanguage) => void;
} {
  const { i18n } = useTranslation();

  // One-time migration for users who set a language preference before the
  // cookie existed (see DECISIONS.md D-069): if no cookie is present yet but
  // a legacy localStorage value is, promote it to the cookie so SSR can see
  // it on the next request, then remove the legacy key — the cookie is the
  // sole source of truth from this point on, avoiding a permanent
  // dual-source-of-truth between the two.
  useEffect(() => {
    if (readLanguageCookie()) return;
    const legacy = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (legacy && isSupportedLanguage(legacy)) {
      writeLanguageCookie(legacy);
    }
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  }, []);

  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = getLocaleMetadata(i18n.language as SupportedLanguage).direction;
  }, [i18n.language]);

  const setLanguage = useCallback(
    (language: SupportedLanguage) => {
      writeLanguageCookie(language);
      void i18n.changeLanguage(language);
    },
    [i18n],
  );

  return { language: i18n.language as SupportedLanguage, setLanguage };
}
