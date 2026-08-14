"use client";

import type { Editor } from "@tiptap/react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface SectionListProps {
  editor: Editor;
  count: number;
  disabled: boolean;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
}

function sectionLabel(editor: Editor, index: number): string {
  const node = editor.state.doc.child(index);
  if (node.type.name === "docSection") {
    const title = node.firstChild?.textContent.trim();
    return title || "";
  }
  return node.textContent.trim();
}

/**
 * Move-up/move-down/remove controls for the document's top-level blocks
 * (sections) — deliberately simple buttons, not a drag-and-drop library
 * (see docs/UI_PATTERNS.md's stated preference for this editor).
 */
export function SectionList({ editor, count, disabled, onMove, onRemove }: SectionListProps) {
  const { t } = useTranslation();
  if (count <= 1) return null;

  return (
    <ol className="border-border flex flex-col gap-1 rounded-md border p-2">
      {Array.from({ length: count }, (_, index) => {
        const label = sectionLabel(editor, index) || t("documentTemplateBuilder.untitledBlock");
        return (
          <li key={index} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{label}</span>
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled={disabled || index === 0}
                onClick={() => onMove(index, -1)}
                aria-label={t("documentTemplateBuilder.moveUp")}
                className="hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded p-1 disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronUp className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={disabled || index === count - 1}
                onClick={() => onMove(index, 1)}
                aria-label={t("documentTemplateBuilder.moveDown")}
                className="hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded p-1 disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronDown className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemove(index)}
                aria-label={t("documentTemplateBuilder.removeBlock")}
                className="hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded p-1 disabled:pointer-events-none disabled:opacity-30"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
