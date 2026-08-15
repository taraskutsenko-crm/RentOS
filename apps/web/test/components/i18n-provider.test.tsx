import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTranslation } from "react-i18next";

import { I18nProvider } from "../../src/components/i18n-provider";

function TranslatedProbe() {
  const { t, i18n } = useTranslation();
  return (
    <div>
      <span data-testid="active-language">{i18n.language}</span>
      <span data-testid="translated">{t("app.name")}</span>
    </div>
  );
}

// Proves the fix for React hydration error #418: given the same
// `initialLanguage` the server resolved (see layout.test.tsx), the very
// first client render already shows that language's real translation — no
// separate "English first, then switch" pass, and no async gap between
// mount and the translated text being present. See DECISIONS.md D-069.
describe("I18nProvider first-render locale determinism (D-069)", () => {
  it("renders English translations immediately when initialLanguage is en", () => {
    render(
      <I18nProvider initialLanguage="en">
        <TranslatedProbe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("active-language")).toHaveTextContent("en");
    expect(screen.getByTestId("translated")).toHaveTextContent("Havelio");
  });

  it("renders Russian translations immediately when initialLanguage is ru — no flash of English", () => {
    render(
      <I18nProvider initialLanguage="ru">
        <TranslatedProbe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("active-language")).toHaveTextContent("ru");
    expect(screen.getByTestId("translated").textContent).not.toBe("app.name");
    expect(screen.getByTestId("translated").textContent).not.toBe("");
  });

  it("renders Ukrainian translations immediately when initialLanguage is uk — no flash of English", () => {
    render(
      <I18nProvider initialLanguage="uk">
        <TranslatedProbe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("active-language")).toHaveTextContent("uk");
    expect(screen.getByTestId("translated").textContent).not.toBe("app.name");
  });

  it("creates an isolated instance per mount — two providers with different languages don't leak into each other", () => {
    const { unmount } = render(
      <I18nProvider initialLanguage="ru">
        <TranslatedProbe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("active-language")).toHaveTextContent("ru");
    unmount();

    render(
      <I18nProvider initialLanguage="en">
        <TranslatedProbe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("active-language")).toHaveTextContent("en");
  });
});
