"use client";

import { Button } from "@rentos/ui";
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
        <span className="font-semibold">{t("app.name")}</span>
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
