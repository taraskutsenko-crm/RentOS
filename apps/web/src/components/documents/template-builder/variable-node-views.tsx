"use client";

import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useTranslation } from "react-i18next";

import { DOCUMENT_VARIABLES } from "../../../lib/document-variable-registry";

function variableLabel(path: string): string {
  return DOCUMENT_VARIABLES.find((v) => v.path === path)?.labelKey ?? path;
}

/** The chip a user sees instead of `{{dot.path}}` — e.g. "Rental total", never the raw resolver syntax. */
export function VariableChipView({ node }: ReactNodeViewProps) {
  const { t } = useTranslation();
  const path = String(node.attrs.path ?? "");
  return (
    <NodeViewWrapper as="span" className="doc-builder-chip" contentEditable={false}>
      {t(variableLabel(path))}
    </NodeViewWrapper>
  );
}

/** The block placeholder for a raw-HTML table variable (e.g. the rented-assets table) — shown as a labeled box, not the actual table. */
export function VariableBlockView({ node }: ReactNodeViewProps) {
  const { t } = useTranslation();
  const path = String(node.attrs.path ?? "");
  return (
    <NodeViewWrapper className="doc-builder-block" contentEditable={false}>
      {t(variableLabel(path))}
    </NodeViewWrapper>
  );
}
