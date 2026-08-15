"use client";

import type { SupportedLanguage } from "@rentos/localization";
import { type ReactNode, useState } from "react";
import { I18nextProvider } from "react-i18next";

import { createI18nInstance } from "../lib/i18n";

export interface I18nProviderProps {
  children: ReactNode;
  /**
   * The locale resolved server-side from the persisted cookie (see
   * layout.tsx / DECISIONS.md D-069). Used as the lazy-init seed below so
   * the very first client render matches whatever the server already sent
   * — no post-hydration language switch, no hydration mismatch.
   */
  initialLanguage: SupportedLanguage;
}

export function I18nProvider({ children, initialLanguage }: I18nProviderProps) {
  // The lazy initializer runs once per component instance: once per SSR
  // request on the server (isolating concurrent requests from each other),
  // and once on mount in the browser (a stable singleton for the session,
  // matching prior UX). See createI18nInstance's doc comment.
  const [instance] = useState(() => createI18nInstance(initialLanguage));
  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
