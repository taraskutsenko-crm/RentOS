"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { BreadcrumbProvider } from "../../components/shell/breadcrumb-context";
import { CommandPalette } from "../../components/shell/command-palette";
import { Header } from "../../components/shell/header";
import { Sidebar } from "../../components/shell/sidebar";
import { useMe } from "../../hooks/use-auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, isLoading, isError } = useMe();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  useEffect(() => {
    if (isError) {
      router.replace("/login");
    }
  }, [isError, router]);

  // Cmd/Ctrl+K opens the unified global-search + command palette from
  // anywhere in the shell — see docs/UI_REDESIGN_PLAN.md Chapter 1.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
    <BreadcrumbProvider>
      <div className="flex min-h-screen">
        <Sidebar
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            onOpenMobileNav={() => setMobileNavOpen(true)}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          />
          <main className="flex-1 p-6 sm:p-8">{children}</main>
        </div>
        <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
      </div>
    </BreadcrumbProvider>
  );
}
