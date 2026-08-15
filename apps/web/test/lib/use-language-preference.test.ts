import { act, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useLanguagePreference } from "../../src/hooks/use-language-preference";
import { createI18nInstance, LANGUAGE_COOKIE_NAME, LANGUAGE_STORAGE_KEY } from "../../src/lib/i18n";

function clearLanguageCookie(): void {
  document.cookie = `${LANGUAGE_COOKIE_NAME}=; path=/; max-age=0`;
}

function readLanguageCookie(): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${LANGUAGE_COOKIE_NAME}=([^;]*)`));
  return match?.[1] !== undefined ? decodeURIComponent(match[1]) : undefined;
}

describe("useLanguagePreference (D-069 cookie persistence)", () => {
  beforeEach(() => {
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    clearLanguageCookie();
  });

  afterEach(() => {
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    clearLanguageCookie();
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    const instance = createI18nInstance("en");
    return createElement(I18nextProvider, { i18n: instance }, children);
  }

  it("reflects the active i18next language", () => {
    const { result } = renderHook(() => useLanguagePreference(), { wrapper });
    expect(result.current.language).toBe("en");
  });

  it("persists the chosen language to the cookie (not localStorage) and changes i18next's active language", async () => {
    const { result } = renderHook(() => useLanguagePreference(), { wrapper });

    await act(async () => {
      result.current.setLanguage("de");
      await Promise.resolve();
    });

    expect(readLanguageCookie()).toBe("de");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
    expect(result.current.language).toBe("de");
  });

  it("keeps document.documentElement.lang and dir in sync with the active language", async () => {
    const { result } = renderHook(() => useLanguagePreference(), { wrapper });

    await act(async () => {
      result.current.setLanguage("zh-CN");
      await Promise.resolve();
    });

    expect(document.documentElement.lang).toBe("zh-CN");
    // zh-CN is ltr in the locale registry — no RTL locale ships today.
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("persists across a simulated reload: a fresh SSR-style resolution from the cookie picks up the change", async () => {
    const { result } = renderHook(() => useLanguagePreference(), { wrapper });

    await act(async () => {
      result.current.setLanguage("ru");
      await Promise.resolve();
    });

    // Simulate what the next request's layout.tsx would do: read the same
    // cookie the browser now holds and resolve a fresh instance from it —
    // exactly the SSR resolution path, driven by client-persisted state.
    const persisted = readLanguageCookie();
    expect(persisted).toBe("ru");
    const freshInstance = createI18nInstance(persisted as "ru");
    expect(freshInstance.language).toBe("ru");
  });

  it("migrates a pre-existing localStorage-only preference into the cookie on first mount, then clears localStorage", () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "fr");
    expect(readLanguageCookie()).toBeUndefined();

    renderHook(() => useLanguagePreference(), { wrapper });

    expect(readLanguageCookie()).toBe("fr");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
  });

  it("does not let a legacy localStorage value override an already-persisted cookie (cookie wins, no dual source of truth)", () => {
    document.cookie = `${LANGUAGE_COOKIE_NAME}=ja; path=/`;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "fr");

    renderHook(() => useLanguagePreference(), { wrapper });

    expect(readLanguageCookie()).toBe("ja");
  });

  it("ignores a corrupt legacy localStorage value during migration", () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "not-a-real-locale");

    renderHook(() => useLanguagePreference(), { wrapper });

    expect(readLanguageCookie()).toBeUndefined();
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
  });
});
