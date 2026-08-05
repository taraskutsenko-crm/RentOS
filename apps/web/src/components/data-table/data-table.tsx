"use client";

import { type ReactNode, useMemo, useState } from "react";
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
  cn,
} from "@rentos/ui";
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, ChevronsUpDown, Lock } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

import type { DataTableColumn, SortState } from "./types";
import { BulkActionsBar, type BulkAction } from "./bulk-actions-bar";

const DEFAULT_SKELETON_ROWS = 5;

export interface DataTableSelection {
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[] | undefined;
  getRowId: (row: T) => string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  /** Rendered when the current user lacks the permission to view this list at all. */
  permissionDenied?: boolean;
  emptyState: ReactNode;
  sort?: SortState;
  onSortChange?: (next: SortState) => void;
  selection?: DataTableSelection;
  bulkActions?: BulkAction[];
  /** Row becomes a real `<Link>` when this returns a truthy href. */
  rowHref?: (row: T) => string | undefined;
  /** Rendered inside the row's overflow menu — omit to skip the menu entirely for that row. */
  rowActions?: (row: T) => ReactNode | undefined;
  /** Lets a user hide/show non-essential columns; off by default. */
  enableColumnVisibility?: boolean;
  /** Custom mobile-card renderer; falls back to `mobileRole`-tagged columns when omitted. */
  renderMobileCard?: (row: T) => ReactNode;
}

/**
 * The one shared table for every data-heavy staff screen — see
 * docs/UI_REDESIGN_PLAN.md Chapter 3. Owns its own `Card` shell, every
 * required state (loading/skeleton/empty/error/permission-denied), an
 * optional selection + contextual bulk-actions bar, optional
 * column-header sort, optional column visibility, a sticky header
 * (pinned beneath the shell's own `h-14` header), and a responsive
 * mobile-card fallback below `sm`.
 */
export function DataTable<T>({
  columns,
  data,
  getRowId,
  isLoading = false,
  isError = false,
  onRetry,
  permissionDenied = false,
  emptyState,
  sort,
  onSortChange,
  selection,
  bulkActions,
  rowHref,
  rowActions,
  enableColumnVisibility = false,
  renderMobileCard,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(
    () => new Set(columns.filter((column) => column.hideByDefault).map((column) => column.id)),
  );

  const visibleColumns = useMemo(
    () => columns.filter((column) => !hiddenColumns.has(column.id)),
    [columns, hiddenColumns],
  );

  const rows = data ?? [];
  const selectedCount = selection?.selectedIds.size ?? 0;
  const allSelected = selection ? rows.length > 0 && selectedCount === rows.length : false;
  const someSelected = selection ? selectedCount > 0 && !allSelected : false;

  function toggleColumn(columnId: string): void {
    setHiddenColumns((current) => {
      const next = new Set(current);
      if (next.has(columnId)) next.delete(columnId);
      else next.add(columnId);
      return next;
    });
  }

  function toggleSelectAll(): void {
    if (!selection) return;
    if (allSelected) selection.onSelectionChange(new Set());
    else selection.onSelectionChange(new Set(rows.map(getRowId)));
  }

  function toggleSelectRow(id: string): void {
    if (!selection) return;
    const next = new Set(selection.selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onSelectionChange(next);
  }

  function handleSortClick(column: DataTableColumn<T>): void {
    if (!column.sortable || !onSortChange) return;
    const key = column.sortKey ?? column.id;
    if (sort?.sortBy !== key) {
      onSortChange({ sortBy: key, sortDirection: "asc" });
    } else if (sort.sortDirection === "asc") {
      onSortChange({ sortBy: key, sortDirection: "desc" });
    } else {
      onSortChange({ sortBy: null, sortDirection: "asc" });
    }
  }

  function sortIconFor(column: DataTableColumn<T>): ReactNode {
    if (!column.sortable) return null;
    const key = column.sortKey ?? column.id;
    if (sort?.sortBy !== key) {
      return <ArrowUpDown className="text-muted-foreground/60 size-3.5" aria-hidden="true" />;
    }
    return sort.sortDirection === "asc" ? (
      <ArrowUp className="size-3.5" aria-hidden="true" />
    ) : (
      <ArrowDown className="size-3.5" aria-hidden="true" />
    );
  }

  const showBulkActionsBar = Boolean(selection && selectedCount > 0 && bulkActions);
  const showColumnsToggle = enableColumnVisibility && !showBulkActionsBar;
  const showToolbar = showBulkActionsBar || showColumnsToggle;

  return (
    <Card>
      {showToolbar && (
        <div className="border-border flex h-12 items-center justify-between border-b px-3">
          {showBulkActionsBar && selection && bulkActions ? (
            <BulkActionsBar
              count={selectedCount}
              actions={bulkActions}
              onClear={() => selection.onSelectionChange(new Set())}
            />
          ) : (
            <span />
          )}
          {showColumnsToggle && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="ml-auto">
                  <ChevronsUpDown className="size-3.5" aria-hidden="true" />
                  {t("common.table.columns")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t("common.table.columns")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {columns.map((column) => (
                  <label
                    key={column.id}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-800 flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
                  >
                    <Checkbox
                      checked={!hiddenColumns.has(column.id)}
                      onCheckedChange={() => toggleColumn(column.id)}
                    />
                    {column.header}
                  </label>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      <CardContent className="p-0">
        {permissionDenied ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <Lock className="text-muted-foreground size-8" aria-hidden="true" />
            <p className="text-muted-foreground text-sm">{t("common.table.permissionDenied")}</p>
          </div>
        ) : isError ? (
          <div className="p-6">
            <Alert variant="destructive">
              <AlertCircle className="size-4" aria-hidden="true" />
              <AlertDescription className="flex items-center justify-between gap-4">
                <span>{t("common.error")}</span>
                {onRetry && (
                  <Button variant="outline" size="sm" onClick={onRetry}>
                    {t("common.table.retry")}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          </div>
        ) : isLoading ? (
          <div
            className="flex flex-col gap-3 p-4"
            role="status"
            aria-live="polite"
            aria-label={t("common.loading")}
          >
            {Array.from({ length: DEFAULT_SKELETON_ROWS }).map((_, rowIndex) => (
              <div key={rowIndex} className="flex gap-4">
                {visibleColumns.map((column, columnIndex) => (
                  <Skeleton
                    key={column.id}
                    className={cn("h-5 flex-1", columnIndex === 0 && "max-w-48")}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">{emptyState}</div>
        ) : (
          <>
            <div className="hidden max-h-[70vh] overflow-auto sm:block">
              <table className="w-full text-sm">
                <thead className="bg-card sticky top-0 z-10">
                  <tr className="border-b text-left">
                    {selection && (
                      <th className="w-10 p-3">
                        <Checkbox
                          checked={someSelected ? "indeterminate" : allSelected}
                          onCheckedChange={toggleSelectAll}
                          aria-label={t("common.table.selectAll")}
                        />
                      </th>
                    )}
                    {visibleColumns.map((column) => (
                      <th
                        key={column.id}
                        scope="col"
                        aria-sort={
                          column.sortable
                            ? sort?.sortBy === (column.sortKey ?? column.id)
                              ? sort.sortDirection === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                            : undefined
                        }
                        className={cn(
                          "p-3 font-medium",
                          column.align === "right" && "text-right",
                          column.align === "center" && "text-center",
                          column.className,
                        )}
                      >
                        {column.sortable ? (
                          <button
                            type="button"
                            onClick={() => handleSortClick(column)}
                            className="hover:text-foreground focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded outline-none focus-visible:ring-[3px]"
                          >
                            {column.header}
                            {sortIconFor(column)}
                          </button>
                        ) : (
                          column.header
                        )}
                      </th>
                    ))}
                    {rowActions && <th className="w-10 p-3" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const id = getRowId(row);
                    const href = rowHref?.(row);
                    return (
                      <tr key={id} className="border-b last:border-0">
                        {selection && (
                          <td className="p-3">
                            <Checkbox
                              checked={selection.selectedIds.has(id)}
                              onCheckedChange={() => toggleSelectRow(id)}
                              aria-label={t("common.table.selectRow")}
                            />
                          </td>
                        )}
                        {visibleColumns.map((column) => (
                          <td
                            key={column.id}
                            className={cn(
                              "p-3",
                              column.align === "right" && "text-right",
                              column.align === "center" && "text-center",
                              column.className,
                            )}
                          >
                            {href && column === visibleColumns[0] ? (
                              <Link href={href} className="hover:underline">
                                {column.cell(row)}
                              </Link>
                            ) : (
                              column.cell(row)
                            )}
                          </td>
                        ))}
                        {rowActions && (
                          <td className="p-3 text-right">
                            {rowActions(row) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={t("common.table.rowActions")}
                                  >
                                    <span aria-hidden="true">⋯</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {rowActions(row)}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 p-3 sm:hidden">
              {rows.map((row) => {
                const id = getRowId(row);
                const href = rowHref?.(row);
                let content: ReactNode;
                if (renderMobileCard) {
                  content = renderMobileCard(row);
                } else {
                  const primary = columns.find((column) => column.mobileRole === "primary");
                  const secondary = columns.filter((column) => column.mobileRole === "secondary");
                  content = (
                    <div className="flex flex-col gap-1 rounded-md border p-3">
                      <span className="font-medium">{primary?.cell(row)}</span>
                      {secondary.length > 0 && (
                        <span className="text-muted-foreground text-xs">
                          {secondary.map((column) => column.cell(row)).join(" · ")}
                        </span>
                      )}
                    </div>
                  );
                }
                return href ? (
                  <Link key={id} href={href} className="block">
                    {content}
                  </Link>
                ) : (
                  <div key={id}>{content}</div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
