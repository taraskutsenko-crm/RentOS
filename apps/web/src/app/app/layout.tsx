"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { BreadcrumbProvider } from "../../components/shell/breadcrumb-context";
import { CommandPalette } from "../../components/shell/command-palette";
import { Header } from "../../components/shell/header";
import { ShortcutsHelpDialog } from "../../components/shell/shortcuts-help-dialog";
import { Sidebar } from "../../components/shell/sidebar";
import { useAppShortcuts } from "../../hooks/use-app-shortcuts";
import { useMe } from "../../hooks/use-auth";
import { useKeyboardShortcuts } from "../../hooks/use-keyboard-shortcuts";
import { useTrackRecentItem } from "../../hooks/use-recent-items";
import { ALL_NAV_ITEMS } from "../../lib/nav-registry";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { data, isLoading, isError } = useMe();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const trackRecentItem = useTrackRecentItem();

  useEffect(() => {
    if (isError) {
      router.replace("/login");
    }
  }, [isError, router]);

  // Records a top-level page view for the Recent Items section — only an
  // exact match (never a sub-route like /app/customers/123, which the
  // customer detail page already records itself as an entity view) — see
  // docs/UI_REDESIGN_PLAN.md Chapter 5, design decision 5.
  useEffect(() => {
    const item = ALL_NAV_ITEMS.find((navItem) => navItem.href === pathname);
    if (!item) return;
    trackRecentItem({
      id: `page:${item.href}`,
      kind: "page",
      label: t(item.labelKey),
      href: item.href,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-runs on route change
  }, [pathname]);

  const shortcuts = useAppShortcuts({
    onOpenCommandPalette: () => setCommandPaletteOpen((current) => !current),
    onOpenQuickCreate: () => setQuickCreateOpen(true),
    onOpenShortcutsHelp: () => setShortcutsHelpOpen((current) => !current),
  });
  useKeyboardShortcuts(shortcuts);

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
            quickCreateOpen={quickCreateOpen}
            onQuickCreateOpenChange={setQuickCreateOpen}
          />
          <main className="flex-1 p-6 sm:p-8">{children}</main>
        </div>
        <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
        <ShortcutsHelpDialog
          open={shortcutsHelpOpen}
          onOpenChange={setShortcutsHelpOpen}
          shortcuts={shortcuts}
        />
      </div>
    </BreadcrumbProvider>
  );
}
