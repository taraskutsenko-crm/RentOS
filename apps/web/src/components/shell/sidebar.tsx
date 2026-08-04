"use client";

import { cn } from "@rentos/ui";
import { ChevronsLeft, ChevronsRight, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

import { usePermission } from "../../hooks/use-current-tenant-role";
import { useSidebarCollapsed } from "../../hooks/use-sidebar-state";
import { findNavItemForPath, NAV_GROUPS, type NavItem } from "../../lib/nav-registry";

/**
 * The staff app's primary navigation surface — see
 * docs/UI_REDESIGN_PLAN.md Chapter 1. Replaces the previous flat top-bar
 * link list (docs/UI_AUDIT.md finding #1) and fixes the previously
 * unconditional nav rendering (finding #4) by gating every item on its
 * registry-declared permission.
 */
export function Sidebar({
  mobileOpen,
  onCloseMobile,
  onOpenCommandPalette,
}: {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenCommandPalette: () => void;
}) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const activeItem = findNavItemForPath(pathname);

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label={t("app.shell.closeNav")}
          className="fixed inset-0 z-overlay bg-black/40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}
      <aside
        aria-label={t("app.shell.sidebarLabel")}
        className={cn(
          "bg-sidebar text-sidebar-foreground border-border fixed inset-y-0 left-0 z-drawer flex flex-col border-r",
          "transition-[width,transform] duration-[var(--duration-moderate)] ease-[var(--ease-standard)]",
          collapsed ? "w-16" : "w-60",
          "lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b px-3">
          <Link
            href="/app"
            className="flex min-w-0 items-center gap-2 font-semibold"
            aria-label={t("app.name")}
          >
            <span className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-sm text-sm">
              H
            </span>
            {!collapsed && <span className="truncate">{t("app.name")}</span>}
          </Link>
        </div>

        <button
          type="button"
          onClick={onOpenCommandPalette}
          className={cn(
            "border-border text-muted-foreground hover:text-foreground m-2 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm",
            "transition-colors duration-[var(--duration-fast)]",
            collapsed ? "justify-center" : "justify-between",
          )}
        >
          <span className="flex items-center gap-2">
            <Search className="size-4 shrink-0" aria-hidden="true" />
            {!collapsed && <span>{t("app.shell.searchPlaceholder")}</span>}
          </span>
          {!collapsed && (
            <kbd className="border-border bg-background rounded border px-1.5 py-0.5 text-xs">
              ⌘K
            </kbd>
          )}
        </button>

        <nav className="flex-1 overflow-y-auto px-2 pb-2" aria-label={t("app.shell.sidebarLabel")}>
          {NAV_GROUPS.map((group) => (
            <SidebarGroup
              key={group.id}
              groupLabelKey={group.labelKey}
              items={group.items}
              activeItemId={activeItem?.id ?? null}
              collapsed={collapsed}
            />
          ))}
        </nav>

        <div className="border-t p-2">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="text-muted-foreground hover:text-foreground hover:bg-neutral-50 dark:hover:bg-neutral-800 flex w-full items-center justify-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-[var(--duration-fast)]"
            aria-label={collapsed ? t("app.shell.expandSidebar") : t("app.shell.collapseSidebar")}
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
            {!collapsed && <span>{t("app.shell.collapseSidebar")}</span>}
          </button>
        </div>
      </aside>
    </>
  );
}

function SidebarGroup({
  groupLabelKey,
  items,
  activeItemId,
  collapsed,
}: {
  groupLabelKey: string | null;
  items: NavItem[];
  activeItemId: string | null;
  collapsed: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 first:mt-1">
      {groupLabelKey && !collapsed && (
        <p className="text-muted-foreground px-2.5 pb-1 text-xs font-medium tracking-wide uppercase">
          {t(groupLabelKey)}
        </p>
      )}
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => (
          <SidebarNavItem
            key={item.id}
            item={item}
            isActive={item.id === activeItemId}
            collapsed={collapsed}
          />
        ))}
      </ul>
    </div>
  );
}

function SidebarNavItem({
  item,
  isActive,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
}) {
  const { t } = useTranslation();
  // Permission-aware navigation: an item with no declared permission is
  // visible to every active tenant member (matches Customers today); an
  // item requiring a permission the caller lacks is omitted entirely,
  // never shown disabled — see docs/UX_PRINCIPLES.md rule 17.
  // usePermission() takes a required Permission, so a harmless
  // placeholder is passed when this item has none — its result is
  // discarded below via `item.permission === null`, never surfaced.
  const permissionResult = usePermission(item.permission ?? "customers.portal.manage");
  const hasAccess = item.permission === null ? true : permissionResult;
  if (!hasAccess) return null;

  const Icon = item.icon;
  const label = t(item.labelKey);

  return (
    <li>
      <Link
        href={item.href}
        title={collapsed ? label : undefined}
        className={cn(
          "relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-[var(--duration-fast)]",
          collapsed && "justify-center",
          isActive
            ? "bg-primary-light text-primary font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-neutral-50 dark:hover:bg-neutral-800",
        )}
      >
        {isActive && (
          <span
            className="bg-primary absolute top-1 bottom-1 left-0 w-0.5 rounded-full"
            aria-hidden="true"
          />
        )}
        <Icon className="size-5 shrink-0" aria-hidden="true" />
        {!collapsed && <span className="truncate">{label}</span>}
        {collapsed && <span className="sr-only">{label}</span>}
      </Link>
    </li>
  );
}
