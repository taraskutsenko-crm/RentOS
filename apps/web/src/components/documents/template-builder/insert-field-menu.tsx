"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  DocumentVariableGroup,
  DocumentVariableMeta,
} from "../../../lib/document-variable-registry";

export interface InsertFieldMenuProps {
  groups: Array<{ group: DocumentVariableGroup; variables: DocumentVariableMeta[] }>;
  groupLabelKeys: Record<DocumentVariableGroup, string>;
  onInsert: (variable: DocumentVariableMeta) => void;
  disabled: boolean;
}

/**
 * A grouped picker for inserting a document field as a readable chip — the
 * core "no HTML/CSS/template syntax" affordance: the user picks "Rental
 * total," never types `{{rental.total}}`. A plain custom dropdown rather
 * than pulling in a new Radix dependency into apps/web (only packages/ui
 * currently depends on @radix-ui/react-popover).
 */
export function InsertFieldMenu({
  groups,
  groupLabelKeys,
  onInsert,
  disabled,
}: InsertFieldMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        className="border-input hover:bg-neutral-50 dark:hover:bg-neutral-800 flex h-9 items-center gap-1 rounded-md border bg-transparent px-3 text-sm disabled:pointer-events-none disabled:opacity-50"
      >
        {t("documentTemplateBuilder.insertField")}
      </button>
      {open && (
        <div
          role="menu"
          className="bg-popover text-popover-foreground shadow-popover border-border havelio-pop z-dropdown absolute top-full left-0 mt-1 max-h-80 w-72 overflow-y-auto rounded-md border p-2"
        >
          {groups.map(({ group, variables }) => (
            <div key={group} className="mb-2 last:mb-0">
              <div className="text-muted-foreground px-2 py-1 text-xs font-medium uppercase">
                {t(groupLabelKeys[group])}
              </div>
              {variables.map((variable) => (
                <button
                  key={variable.path}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onInsert(variable);
                    setOpen(false);
                  }}
                  className="hover:bg-neutral-50 dark:hover:bg-neutral-800 w-full rounded-md px-2 py-1.5 text-left text-sm"
                >
                  {t(variable.labelKey)}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
