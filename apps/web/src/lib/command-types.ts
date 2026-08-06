import type { LucideIcon } from "lucide-react";

/**
 * The Command Palette's data model — see docs/UI_REDESIGN_PLAN.md
 * Chapter 1, decision 3, and Chapter 5, design decision 1. Every
 * section (Recent, Pinned, Quick Actions, Search, Navigation) composes
 * the same `CommandItem` shape into one list — the palette itself has
 * no per-section rendering branch beyond a group heading.
 *
 * AI extension point (not implemented — see
 * docs/UI_REDESIGN_PLAN.md Chapter 5, design decision 9): a future AI
 * agent invokes a command the same way a human `Enter` keypress does —
 * `kind: "action"` commands already carry a plain `run()` closure, and
 * every other kind already carries a plain `href` — nothing about
 * executing one requires DOM interaction.
 */
export type CommandKind = "navigate" | "action" | "recent" | "pinned" | "search-result";

export interface CommandItem {
  id: string;
  kind: CommandKind;
  label: string;
  description?: string | undefined;
  /** present for "navigate", "recent", "pinned", and "search-result" */
  href?: string;
  /** present for "action" — a future AI agent calls this identically to a human Enter keypress */
  run?: () => void;
  icon?: LucideIcon;
  group: string;
}

/** A record ref a `CommandItem` can be built from — shared by search results, recent items, and pinned items. */
export interface SearchableEntityRef {
  entityType: "customer" | "asset" | "rental" | "quote" | "document";
  entityId: string;
}
