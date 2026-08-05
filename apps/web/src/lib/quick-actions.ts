import { CalendarRange, FilePlus, FileText, Package, Users, type LucideIcon } from "lucide-react";

import type { Permission } from "./permissions";

export interface QuickActionDefinition {
  id: string;
  href: string;
  labelKey: string;
  icon: LucideIcon;
  /** null for actions with no permission family (e.g. Customers). */
  permission: Permission | null;
}

/**
 * The single source of truth for the five existing, already-permission-gated
 * create routes — shared by the header's `QuickCreate` dropdown and the
 * dashboard's `QuickActions` widget so the two never drift out of sync
 * (see docs/UI_AUDIT.md finding #25's sibling bug: this list was previously
 * duplicated in `QuickCreate` alone and missed the Documents action added in
 * Chapter 3).
 */
export const QUICK_ACTION_DEFINITIONS: QuickActionDefinition[] = [
  {
    id: "customer",
    href: "/app/customers/new",
    labelKey: "customer.newCustomer",
    icon: Users,
    permission: null,
  },
  {
    id: "asset",
    href: "/app/assets/new",
    labelKey: "asset.newAsset",
    icon: Package,
    permission: "assets.create",
  },
  {
    id: "rental",
    href: "/app/rentals/new",
    labelKey: "rental.newRental",
    icon: CalendarRange,
    permission: "rentals.create",
  },
  {
    id: "quote",
    href: "/app/quotes/new",
    labelKey: "quote.newQuote",
    icon: FileText,
    permission: "quotes.create",
  },
  {
    id: "document",
    href: "/app/documents/new",
    labelKey: "document.newDocument",
    icon: FilePlus,
    permission: "documents.create",
  },
];
