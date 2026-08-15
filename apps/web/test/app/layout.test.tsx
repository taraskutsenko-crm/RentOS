import { describe, expect, it, vi } from "vitest";

const cookiesMock = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => cookiesMock(),
}));

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-sans-loaded" }),
  JetBrains_Mono: () => ({ variable: "--font-mono-loaded" }),
}));

import RootLayout from "../../src/app/layout";
import { LANGUAGE_COOKIE_NAME } from "../../src/lib/i18n";

function mockCookieStore(value: string | undefined): void {
  cookiesMock.mockResolvedValue({
    get: (name: string) =>
      name === LANGUAGE_COOKIE_NAME && value !== undefined ? { value } : undefined,
  });
}

// These tests exercise RootLayout as a plain async function — a Server
// Component is just a function that returns a React element tree, so
// calling it directly and inspecting `.props` verifies the actual
// cookie -> <html lang>/dir -> I18nProvider wiring that fixes the SSR/
// hydration mismatch (React error #418) without needing a real Next.js
// render pipeline. See DECISIONS.md D-069.
describe("RootLayout SSR locale resolution (D-069)", () => {
  it("resolves English + ltr when no locale cookie exists yet (first-ever visit)", async () => {
    mockCookieStore(undefined);
    const element = await RootLayout({ children: <div>child</div> });
    expect(element.props.lang).toBe("en");
    expect(element.props.dir).toBe("ltr");
  });

  it("resolves Russian from the persisted cookie", async () => {
    mockCookieStore("ru");
    const element = await RootLayout({ children: <div>child</div> });
    expect(element.props.lang).toBe("ru");
    expect(element.props.dir).toBe("ltr");
  });

  it("resolves a newly-added locale (Ukrainian) from the persisted cookie", async () => {
    mockCookieStore("uk");
    const element = await RootLayout({ children: <div>child</div> });
    expect(element.props.lang).toBe("uk");
  });

  it("falls back to English for a corrupt or unsupported cookie value", async () => {
    mockCookieStore("not-a-real-locale");
    const element = await RootLayout({ children: <div>child</div> });
    expect(element.props.lang).toBe("en");
  });

  it("passes the resolved language to I18nProvider as initialLanguage, so server and client hydrate with the same locale", async () => {
    mockCookieStore("ru");
    const element = await RootLayout({ children: <div>child</div> });
    const body = element.props.children;
    const i18nProviderElement = body.props.children;
    expect(i18nProviderElement.props.initialLanguage).toBe("ru");
  });
});
