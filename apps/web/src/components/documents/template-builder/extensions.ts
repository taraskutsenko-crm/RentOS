import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { VariableBlockView, VariableChipView } from "./variable-node-views";

/**
 * The block-level container for one contract section — renders to
 * `<div class="doc-section">` in the stored template, matching
 * apps/api/.../base-document-css.ts's existing `.doc-section` styling
 * exactly (no new CSS needed server-side). Its first child must be a
 * DocSectionTitle; everything after is the section body (paragraphs,
 * variable blocks).
 */
export const DocSection = Node.create({
  name: "docSection",
  group: "block",
  content: "docSectionTitle block+",
  isolating: true,
  parseHTML() {
    return [{ tag: "div[data-doc-section]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-doc-section": "" }), 0];
  },
});

/** The section's title line — renders to `.doc-section__title`, must be the first child of a DocSection. */
export const DocSectionTitle = Node.create({
  name: "docSectionTitle",
  group: "block",
  content: "inline*",
  parseHTML() {
    return [{ tag: "div[data-doc-section-title]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-doc-section-title": "" }), 0];
  },
});

/**
 * An inline, non-editable chip standing in for `{{dot.path}}` — see
 * contract-section-library.ts's variableChip() and
 * document-variable-registry.ts for the path catalog. Rendered as a
 * readable label (e.g. "Rental total"), never the raw resolver syntax, per
 * the no-code product requirement.
 */
export const VariableChip = Node.create({
  name: "variableChip",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      path: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-variable-chip]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-variable-chip": "",
        "data-path": node.attrs.path,
      }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(VariableChipView);
  },
});

/**
 * A block-level, non-editable placeholder for a pre-built raw-HTML
 * variable (e.g. `rental.assetsTableHtml`) — occupies its own block,
 * never mixed inline with text, matching how the resolver substitutes it
 * (see RAW_HTML_VARIABLES in variable-resolver.service.ts).
 */
export const VariableBlock = Node.create({
  name: "variableBlock",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      path: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-variable-block]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-variable-block": "",
        "data-path": node.attrs.path,
      }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(VariableBlockView);
  },
});
