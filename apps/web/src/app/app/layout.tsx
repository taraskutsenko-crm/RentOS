"use client";

import { Button } from "@rentos/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { useLogout, useMe } from "../../hooks/use-auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, isLoading, isError } = useMe();
  const logoutMutation = useLogout();

  useEffect(() => {
    if (isError) {
      router.replace("/login");
    }
  }, [isError, router]);

  async function handleLogout(): Promise<void> {
    await logoutMutation.mutateAsync();
    router.replace("/login");
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-6">
          <span className="font-semibold">{t("app.name")}</span>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/app/customers" className="text-muted-foreground hover:text-foreground">
              {t("customer.title")}
            </Link>
            <Link href="/app/assets" className="text-muted-foreground hover:text-foreground">
              {t("asset.title")}
            </Link>
            <Link href="/app/rentals" className="text-muted-foreground hover:text-foreground">
              {t("rental.title")}
            </Link>
            <Link href="/app/quotes" className="text-muted-foreground hover:text-foreground">
              {t("quote.title")}
            </Link>
            <Link href="/app/documents" className="text-muted-foreground hover:text-foreground">
              {t("document.title")}
            </Link>
            <Link
              href="/app/settings/asset-categories"
              className="text-muted-foreground hover:text-foreground"
            >
              {t("asset.categorySettings.navLabel")}
            </Link>
            <Link
              href="/app/settings/asset-statuses"
              className="text-muted-foreground hover:text-foreground"
            >
              {t("asset.statusSettings.navLabel")}
            </Link>
            <Link
              href="/app/settings/asset-fields"
              className="text-muted-foreground hover:text-foreground"
            >
              {t("asset.fieldSettings.navLabel")}
            </Link>
            <Link
              href="/app/settings/rental-billing"
              className="text-muted-foreground hover:text-foreground"
            >
              {t("rental.billingSettings.navLabel")}
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground text-sm">
            {data.user.firstName} {data.user.lastName}
          </span>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            {t("nav.logout")}
          </Button>
        </div>
      </header>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
