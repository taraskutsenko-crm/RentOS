import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { I18nProvider } from "../components/i18n-provider";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans antialiased">
        <I18nProvider>
          <QueryProvider>{children}</QueryProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
