import type { TFunction } from "i18next";

import { findNavItemForPath } from "./nav-registry";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/** Static, non-dynamic path segments that get a human label instead of being hidden. */
const SEGMENT_LABEL_KEYS: Record<string, string> = {
  new: "app.shell.breadcrumbs.new",
  edit: "app.shell.breadcrumbs.edit",
  templates: "documentTemplate.title",
  availability: "rental.availabilityCalendar.title",
};

function crumb(label: string, href?: string): BreadcrumbItem {
  return href ? { label, href } : { label };
}

/**
 * Derives a breadcrumb trail from the current pathname using the nav
 * registry for the top-level crumb. Detail pages that know a record's
 * human-readable name (e.g. a rental number) pass their own `items` to
 * `PageHeader` directly instead of relying on this derivation — see
 * docs/UI_REDESIGN_PLAN.md Chapter 1, decision 7.
 */
export function deriveBreadcrumbs(pathname: string, t: TFunction): BreadcrumbItem[] {
  const navItem = findNavItemForPath(pathname);

  if (!navItem || navItem.href === "/app") {
    return pathname === "/app"
      ? [crumb(t("app.nav.dashboard"))]
      : [crumb(t("app.nav.dashboard"), "/app")];
  }

  const isLastCrumb = pathname === navItem.href;
  const items: BreadcrumbItem[] = [
    crumb(t("app.nav.dashboard"), "/app"),
    crumb(t(navItem.labelKey), isLastCrumb ? undefined : navItem.href),
  ];

  const remainder = pathname.slice(navItem.href.length).split("/").filter(Boolean);
  for (const segment of remainder) {
    const labelKey = SEGMENT_LABEL_KEYS[segment];
    if (!labelKey) continue; // a dynamic id segment with no known label — omitted, not shown as a raw UUID
    items.push(crumb(t(labelKey)));
  }

  return items;
}
