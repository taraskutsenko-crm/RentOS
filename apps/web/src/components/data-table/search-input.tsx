"use client";

import { Input } from "@rentos/ui";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * The one search box every list page's toolbar uses — pairs with
 * `useDataTableState`'s internal debounce, so pages never wire their own
 * `setTimeout`. Always shows a clear button once there's text, matching
 * docs/UI_REDESIGN_PLAN.md Chapter 3's unified search UX requirement.
 */
export function SearchInput({ value, onChange, placeholder, className }: SearchInputProps) {
  const { t } = useTranslation();

  return (
    <div className={className}>
      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder ?? t("common.table.searchPlaceholder")}
          className="pr-8 pl-8"
          aria-label={placeholder ?? t("common.table.searchPlaceholder")}
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={t("common.table.clearSearch")}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute top-1/2 right-2 -translate-y-1/2 rounded-sm outline-none focus-visible:ring-[3px]"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
