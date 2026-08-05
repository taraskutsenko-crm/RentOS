"use client";

import type { ReactNode } from "react";
import { Button } from "@rentos/ui";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface ActiveFilter {
  id: string;
  label: string;
  onRemove: () => void;
}

export interface FilterBarProps {
  children: ReactNode;
  activeFilters?: ActiveFilter[];
  onResetAll?: () => void;
}

/**
 * Shared toolbar row for a page's search box + filter controls, plus the
 * active-filter badge strip beneath it — see docs/UI_REDESIGN_PLAN.md
 * Chapter 3. `children` stays page-specific (a `SearchInput`, a handful of
 * `Select`s, a date range) since each module's actual filter fields
 * differ; only the layout, spacing, and active-badge/reset behavior are
 * shared.
 */
export function FilterBar({ children, activeFilters = [], onResetAll }: FilterBarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">{children}</div>
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.map((filter) => (
            <span
              key={filter.id}
              className="bg-neutral-100 text-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs dark:bg-neutral-800"
            >
              {filter.label}
              <button
                type="button"
                onClick={filter.onRemove}
                aria-label={t("common.filters.remove", { filter: filter.label })}
                className="hover:text-danger focus-visible:ring-ring/50 rounded-sm outline-none focus-visible:ring-[3px]"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          {onResetAll && activeFilters.length > 1 && (
            <Button variant="ghost" size="sm" onClick={onResetAll}>
              {t("common.filters.resetAll")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
