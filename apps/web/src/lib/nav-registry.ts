import {
  Boxes,
  Building2,
  CalendarRange,
  CreditCard,
  FileStack,
  FileText,
  FolderOpen,
  Keyboard,
  LayoutDashboard,
  ListChecks,
  Tags,
  ToggleLeft,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Permission } from "./permissions";

/**
 * The single source of truth for the staff shell's top-level navigation —
 * see docs/UI_REDESIGN_PLAN.md Chapter 1, decision 2. Each item's
 * `permission` is the exact read/view permission required to see it; a
 * `null` permission means every active tenant member can see it (matches
 * Customers, which has no granular permission model yet — see
 * docs/UI_AUDIT.md finding #4). This fixes the previously-unconditional
 * nav rendering that let a TECHNICIAN see, and click into, a 403 on
 * Quotes/Rental billing settings.
 */
export interface NavItem {
  id: string;
  href: string;
  labelKey: string;
  icon: LucideIcon;
  permission: Permission | null;
}

export interface NavGroup {
  id: string;
  labelKey: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "workspace",
    labelKey: null,
    items: [
      {
        id: "dashboard",
        href: "/app",
        labelKey: "app.nav.dashboard",
        icon: LayoutDashboard,
        permission: null,
      },
      {
        id: "customers",
        href: "/app/customers",
        labelKey: "customer.title",
        icon: Users,
        permission: null,
      },
      {
        id: "assets",
        href: "/app/assets",
        labelKey: "asset.title",
        icon: Boxes,
        permission: "assets.read",
      },
      {
        id: "rentals",
        href: "/app/rentals",
        labelKey: "rental.title",
        icon: CalendarRange,
        permission: "rentals.view",
      },
      {
        id: "quotes",
        href: "/app/quotes",
        labelKey: "quote.title",
        icon: FileText,
        permission: "quotes.view",
      },
      {
        id: "documents",
        href: "/app/documents",
        labelKey: "document.title",
        icon: FolderOpen,
        permission: "documents.view",
      },
    ],
  },
  {
    id: "settings",
    labelKey: "app.nav.settingsGroup",
    items: [
      {
        id: "company-profile",
        href: "/app/settings/company-profile",
        labelKey: "tenant.companyProfile.navLabel",
        icon: Building2,
        permission: "tenant.manage",
      },
      {
        id: "asset-categories",
        href: "/app/settings/asset-categories",
        labelKey: "asset.categorySettings.navLabel",
        icon: Tags,
        permission: "asset_categories.read",
      },
      {
        id: "asset-statuses",
        href: "/app/settings/asset-statuses",
        labelKey: "asset.statusSettings.navLabel",
        icon: ToggleLeft,
        permission: "asset_statuses.read",
      },
      {
        id: "asset-fields",
        href: "/app/settings/asset-fields",
        labelKey: "asset.fieldSettings.navLabel",
        icon: ListChecks,
        permission: "asset_fields.read",
      },
      {
        id: "rental-billing",
        href: "/app/settings/rental-billing",
        labelKey: "rental.billingSettings.navLabel",
        icon: CreditCard,
        permission: "rental_settings.view",
      },
      {
        id: "document-templates",
        href: "/app/documents/templates",
        labelKey: "documentTemplate.title",
        icon: FileStack,
        permission: "documents.templates.view",
      },
      {
        id: "shortcuts",
        href: "/app/settings/shortcuts",
        labelKey: "app.shell.shortcuts.title",
        icon: Keyboard,
        permission: null,
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** Finds the deepest matching nav item for a pathname, for active-state and breadcrumb use. */
export function findNavItemForPath(pathname: string): NavItem | null {
  const candidates = ALL_NAV_ITEMS.filter(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, item) => (item.href.length > best.href.length ? item : best));
}
