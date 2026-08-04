"use client";

import { Button } from "@rentos/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { useDarkMode } from "../../../hooks/use-dark-mode";
import { usePortalLogout, usePortalMe } from "../../../hooks/use-portal-auth";
import { usePortalUnreadNotificationCount } from "../../../hooks/use-portal-notifications";

const NAV_ITEMS = [
  { href: "/portal/dashboard", labelKey: "portal.nav.dashboard" },
  { href: "/portal/rentals", labelKey: "portal.nav.rentals" },
  { href: "/portal/calendar", labelKey: "portal.nav.calendar" },
  { href: "/portal/documents", labelKey: "portal.nav.documents" },
  { href: "/portal/messages", labelKey: "portal.nav.messages" },
] as const;

export default function PortalShellLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { data, isLoading, isError } = usePortalMe();
  const logoutMutation = usePortalLogout();
  const [isDark, setDarkMode] = useDarkMode("rentos_portal_dark_mode");
  const { data: unread } = usePortalUnreadNotificationCount();

  useEffect(() => {
    if (isError) {
      router.replace("/portal/login");
    }
  }, [isError, router]);

  async function handleLogout(): Promise<void> {
    await logoutMutation.mutateAsync();
    router.replace("/portal/login");
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
      <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-8">
            <Link href="/portal/dashboard" className="text-sm font-semibold tracking-tight">
              {data.tenant.name}
            </Link>
            <nav className="flex items-center gap-5 text-sm">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    pathname?.startsWith(item.href)
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground transition-colors"
                  }
                >
                  {t(item.labelKey)}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/portal/notifications"
              className="text-muted-foreground hover:text-foreground relative text-sm"
              aria-label={t("portal.nav.notifications")}
            >
              {t("portal.nav.notifications")}
              {!!unread?.count && (
                <span className="bg-primary text-primary-foreground absolute -top-2 -right-3 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium">
                  {unread.count}
                </span>
              )}
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDarkMode(!isDark)}
              aria-label={t("portal.darkMode.toggle")}
            >
              {isDark ? "☀️" : "🌙"}
            </Button>
            <span className="text-muted-foreground hidden text-sm sm:inline">
              {data.customer.firstName} {data.customer.lastName}
            </span>
            <Button variant="outline" size="sm" onClick={() => void handleLogout()}>
              {t("portal.nav.logout")}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
