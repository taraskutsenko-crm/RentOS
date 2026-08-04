"use client";

import { Button } from "@rentos/ui";
import { Menu, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

import { deriveBreadcrumbs } from "../../lib/breadcrumbs";
import { Breadcrumbs } from "./breadcrumbs";
import { useBreadcrumbContext } from "./breadcrumb-context";
import { NotificationsMenu } from "./notifications-menu";
import { QuickCreate } from "./quick-create";
import { TenantSwitcher } from "./tenant-switcher";
import { UserMenu } from "./user-menu";

/**
 * The staff shell's top bar — breadcrumbs and global actions only; the
 * page's own large title lives in `PageHeader`, never duplicated here.
 * See docs/UI_REDESIGN_PLAN.md Chapter 1.
 */
export function Header({
  onOpenMobileNav,
  onOpenCommandPalette,
}: {
  onOpenMobileNav: () => void;
  onOpenCommandPalette: () => void;
}) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { override } = useBreadcrumbContext();
  const breadcrumbs = override ?? deriveBreadcrumbs(pathname, t);

  return (
    <header className="bg-background/80 sticky top-0 z-sticky flex h-14 items-center gap-3 border-b px-4 backdrop-blur">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMobileNav}
        aria-label={t("app.shell.openNav")}
      >
        <Menu className="size-5" />
      </Button>

      <div className="min-w-0 flex-1">
        <Breadcrumbs items={breadcrumbs} />
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenCommandPalette}
        aria-label={t("app.shell.searchPlaceholder")}
      >
        <Search className="size-[18px]" />
      </Button>

      <div className="hidden items-center gap-1 sm:flex">
        <TenantSwitcher />
      </div>

      <div className="flex items-center gap-1">
        <QuickCreate />
        <NotificationsMenu />
        <UserMenu />
      </div>
    </header>
  );
}
