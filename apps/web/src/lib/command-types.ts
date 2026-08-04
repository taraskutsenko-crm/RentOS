/**
 * The Command Palette's data model — see docs/UI_REDESIGN_PLAN.md
 * Chapter 1, decision 3 (Global Search and Command Palette are one
 * unified surface). Only `kind: "navigate"` is implemented today; the
 * other kinds are typed now so a future chapter can add them without
 * reshaping the palette component itself — see docs/UI_PATTERNS.md's
 * Command Palette entry once Chapter 1 adds it.
 */
export type CommandKind = "navigate" | "action" | "search-result" | "recent-page";

export interface CommandItem {
  id: string;
  kind: CommandKind;
  label: string;
  href?: string; // present for "navigate" and "recent-page"
  group: string;
}

/**
 * Future extension seam: a search-result command's underlying entity,
 * once real cross-entity search (Customers/Assets/Rentals/Quotes/
 * Documents) is wired to a real API. Not called anywhere yet.
 */
export interface SearchableEntityRef {
  entityType: "customer" | "asset" | "rental" | "quote" | "document";
  entityId: string;
}
