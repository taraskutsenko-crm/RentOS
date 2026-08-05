import type { ReactNode } from "react";

/** One column of a `DataTable` — see docs/UI_REDESIGN_PLAN.md Chapter 3. */
export interface DataTableColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Omit for a column whose backing list endpoint doesn't accept sortBy/sortDirection yet. */
  sortable?: boolean;
  /** Defaults to `id` when omitted. */
  sortKey?: string;
  align?: "left" | "right" | "center";
  /** Extra classes on both the header and body cell — typically a width hint. */
  className?: string;
  /** Hidden by default in the column-visibility menu (still toggleable). */
  hideByDefault?: boolean;
  /** Role in the auto-generated mobile card when no custom `renderMobileCard` is given. */
  mobileRole?: "primary" | "secondary";
}

export type SortDirection = "asc" | "desc";

export interface SortState {
  sortBy: string | null;
  sortDirection: SortDirection;
}
