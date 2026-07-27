"use client";

import { APP_NAME, APP_TAGLINE } from "@rentos/shared";
import { Button } from "@rentos/ui";
import Link from "next/link";
import { useTranslation } from "react-i18next";

export default function Home() {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">{APP_NAME}</h1>
      <p className="text-muted-foreground">{APP_TAGLINE}</p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/register">{t("auth.register.submit")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/login">{t("auth.login.title")}</Link>
        </Button>
      </div>
    </main>
  );
}
