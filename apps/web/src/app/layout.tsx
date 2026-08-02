import type { Metadata } from "next";

import { I18nProvider } from "../components/i18n-provider";
import { QueryProvider } from "../lib/query-provider";
import "./globals.css";

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
    <html lang="en">
      <body className="antialiased">
        <I18nProvider>
          <QueryProvider>{children}</QueryProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
