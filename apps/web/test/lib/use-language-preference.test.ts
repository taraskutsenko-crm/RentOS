import { act, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useLanguagePreference } from "../../src/hooks/use-language-preference";
import i18n, { LANGUAGE_STORAGE_KEY } from "../../src/lib/i18n";

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(I18nextProvider, { i18n }, children);
}

describe("useLanguagePreference", () => {
  const originalLanguage = i18n.language;

  beforeEach(() => {
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  });

  afterEach(async () => {
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    await act(async () => {
      await i18n.changeLanguage(originalLanguage);
    });
  });

  it("reflects the active i18next language", () => {
    const { result } = renderHook(() => useLanguagePreference(), { wrapper });
    expect(result.current.language).toBe(i18n.language);
  });

  it("persists the chosen language to localStorage and changes i18next's active language", async () => {
    const { result } = renderHook(() => useLanguagePreference(), { wrapper });

    await act(async () => {
      result.current.setLanguage("de");
      // i18n.changeLanguage is async — let its microtask settle.
      await Promise.resolve();
    });

    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("de");
    expect(i18n.language).toBe("de");
  });

  it("keeps document.documentElement.lang and dir in sync with the active language", async () => {
    renderHook(() => useLanguagePreference(), { wrapper });

    await act(async () => {
      await i18n.changeLanguage("zh-CN");
    });

    expect(document.documentElement.lang).toBe("zh-CN");
    // zh-CN is ltr in the locale registry — no RTL locale ships today.
    expect(document.documentElement.dir).toBe("ltr");
  });
});
