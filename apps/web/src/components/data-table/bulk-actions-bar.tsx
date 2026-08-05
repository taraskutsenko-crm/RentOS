"use client";

import type { ReactNode } from "react";
import { Button } from "@rentos/ui";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface BulkAction {
  id: string;
  label: string;
  icon?: ReactNode;
  variant?: "default" | "destructive" | "outline";
  onClick: () => void;
  disabled?: boolean;
}

export interface BulkActionsBarProps {
  count: number;
  actions: BulkAction[];
  onClear: () => void;
}

/**
 * The contextual toolbar shown in place of the column-visibility control
 * once at least one row is selected — see docs/UI_REDESIGN_PLAN.md Chapter 3.
 * Every action is client-side orchestration over an entity's existing
 * single-record endpoint; there is no bulk endpoint on the backend.
 */
export function BulkActionsBar({ count, actions, onClear }: BulkActionsBarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="ghost"
        size="icon"
        onClick={onClear}
        aria-label={t("common.table.clearSelection")}
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
      <span className="text-sm font-medium">{t("common.table.selectedCount", { count })}</span>
      <div className="flex items-center gap-2">
        {actions.map((action) => (
          <Button
            key={action.id}
            variant={action.variant ?? "outline"}
            size="sm"
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.icon}
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
