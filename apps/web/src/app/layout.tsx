import { getLocaleMetadata } from "@rentos/localization";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";

import { I18nProvider } from "../components/i18n-provider";
import { LANGUAGE_COOKIE_NAME, resolveSupportedLanguage } from "../lib/i18n";
import { QueryProvider } from "../lib/query-provider";
import "./globals.css";

// Self-hosted at build time by next/font — no runtime request to Google Fonts.
// See docs/BRAND_GUIDELINES.md "Typography" for the rationale (tabular
// figures for financial tables, wide language coverage for the 6 shipped
// locales) and docs/DECISIONS.md D-041.
const inter = Inter({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Havelio",
  description: "One Platform. Every Asset.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The persisted UI-locale cookie (see DECISIONS.md D-069) is the single
  // source of truth for both this server render and the client's hydration
  // pass — reading it here (rather than defaulting to English) is what
  // eliminates the React #418 hydration mismatch for non-English locales.
  const cookieStore = await cookies();
  const language = resolveSupportedLanguage(cookieStore.get(LANGUAGE_COOKIE_NAME)?.value);
  const { direction } = getLocaleMetadata(language);

  return (
    <html lang={language} dir={direction} className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans antialiased">
        <I18nProvider initialLanguage={language}>
          <QueryProvider>{children}</QueryProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
