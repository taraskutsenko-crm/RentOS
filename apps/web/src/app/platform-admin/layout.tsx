"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { useMe } from "../../hooks/use-auth";

/**
 * Havelio PLATFORM administration (Stage 17 closure pass) — deliberately a
 * fresh top-level route (`/platform-admin`), never nested inside the
 * tenant-scoped `/app` shell (AppLayout requires an active tenant
 * selection; this is cross-tenant Havelio-internal administration, see
 * docs/DECISIONS.md).
 *
 * Frontend hiding is NOT security: every `platform-admin/*` API call is
 * independently re-checked server-side by PlatformAdminGuard (see
 * platform-admin.guard.spec.ts / platform-admin.e2e-spec.ts's K10-
 * equivalent test) regardless of what this layout renders. This gate only
 * gives an ordinary tenant OWNER/ADMIN who stumbles onto the URL a clear,
 * honest "not for you" page instead of a broken UI full of 403s.
 */
export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { data, isLoading, isError } = useMe();

  useEffect(() => {
    if (isError) {
      router.replace("/login");
    }
  }, [isError, router]);

  if (isLoading) {
    return <div className="text-muted-foreground p-6 text-sm">{t("common.loading")}</div>;
  }

  if (!data?.user.isPlatformAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold">{t("platformAdmin.accessDenied.title")}</h1>
          <p className="text-muted-foreground mt-2 text-sm">{t("platformAdmin.accessDenied.description")}</p>
          <Link href="/app" className="text-primary mt-4 inline-block text-sm underline">
            {t("platformAdmin.accessDenied.backToApp")}
          </Link>
        </div>
      </div>
    );
  }

  const navItems = [{ href: "/platform-admin/affiliates", label: t("platformAdmin.nav.affiliates") }];

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
          <span className="font-semibold">{t("platformAdmin.title")}</span>
          <nav className="flex gap-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  pathname.startsWith(item.href)
                    ? "text-primary text-sm font-medium"
                    : "text-muted-foreground text-sm hover:text-foreground"
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link href="/app" className="text-muted-foreground ml-auto text-sm hover:text-foreground">
            {t("platformAdmin.accessDenied.backToApp")}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
    </div>
  );
}
