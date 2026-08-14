"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import type { BlockNode } from "../../../lib/contract-section-library";
import { CONTRACT_SECTIONS } from "../../../lib/contract-section-library";
import {
  DOCUMENT_VARIABLE_GROUP_LABEL_KEYS,
  groupDocumentVariables,
} from "../../../lib/document-variable-registry";
import { DocSection, DocSectionTitle, VariableBlock, VariableChip } from "./extensions";
import { InsertFieldMenu } from "./insert-field-menu";
import { SectionList } from "./section-list";

export const EMPTY_DOC: BlockNode[] = [
  { type: "docSection", content: [{ type: "docSectionTitle", content: [] }] },
];

export interface TemplateBuilderProps {
  /** null starts a blank single-section canvas — see EMPTY_DOC. */
  initialBlocks: BlockNode[] | null;
  onChange: (blocks: BlockNode[]) => void;
  disabled?: boolean | undefined;
}

/** Swaps the doc's top-level child at `index` with its neighbor in `direction` — the only reordering the no-code builder offers, deliberately not drag-and-drop (see docs/UI_PATTERNS.md). */
function moveTopLevelNode(editor: Editor, index: number, direction: -1 | 1) {
  const { state } = editor;
  const { doc } = state;
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= doc.childCount) return;

  const children = [];
  for (let i = 0; i < doc.childCount; i += 1) children.push(doc.child(i));
  const [moved] = children.splice(index, 1);
  children.splice(targetIndex, 0, moved!);

  const newDoc = state.schema.topNodeType.create(doc.attrs, children);
  editor.view.dispatch(state.tr.replaceWith(0, doc.content.size, newDoc.content));
}

function removeTopLevelNode(editor: Editor, index: number) {
  const { state } = editor;
  const { doc } = state;
  if (doc.childCount <= 1) return; // never leave a template with zero content
  const children = [];
  for (let i = 0; i < doc.childCount; i += 1) {
    if (i !== index) children.push(doc.child(i));
  }
  const newDoc = state.schema.topNodeType.create(doc.attrs, children);
  editor.view.dispatch(state.tr.replaceWith(0, doc.content.size, newDoc.content));
}

/**
 * Appends a section's blocks as new top-level siblings, at the exact
 * doc-level end position. Deliberately NOT `.focus("end").insertContent()`:
 * because `docSection` is `isolating`, ProseMirror's selection-based "end"
 * resolves *inside* the last section rather than after it, so the naive
 * approach silently nests the new section inside the existing one instead
 * of appending it as a sibling.
 */
function appendTopLevelBlocks(editor: Editor, blocks: BlockNode[]) {
  const { state } = editor;
  const nodes = blocks.map((block) => state.schema.nodeFromJSON(block));
  editor.view.dispatch(state.tr.insert(state.doc.content.size, nodes));
  editor.commands.focus("end");
}

/**
 * The Tiptap-based no-code contract editor — a normal Havelio user builds a
 * professional contract here with zero HTML/CSS/template-syntax knowledge:
 * type text, insert a field from a picker (renders as a readable chip, not
 * `{{...}}`), add a section from the library, reorder with up/down buttons.
 * Content is authored as ProseMirror JSON (see contract-section-library.ts)
 * and only converted to the `{{dot.path}}`-templated HTML string
 * DocumentRendererService expects at save time (renderBlocksToHtml) — the
 * backend rendering pipeline itself is completely unchanged.
 */
export function TemplateBuilder({ initialBlocks, onChange, disabled }: TemplateBuilderProps) {
  const { t } = useTranslation();
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
      }),
      DocSection,
      DocSectionTitle,
      VariableChip,
      VariableBlock,
    ],
    content: { type: "doc", content: initialBlocks ?? EMPTY_DOC },
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: updatedEditor }) => {
      const json = updatedEditor.getJSON();
      onChangeRef.current((json.content ?? []) as BlockNode[]);
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  if (!editor) return null;

  const topLevelCount = editor.state.doc.childCount;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <InsertFieldMenu
          disabled={!!disabled}
          groups={groupDocumentVariables()}
          groupLabelKeys={DOCUMENT_VARIABLE_GROUP_LABEL_KEYS}
          onInsert={(variable) => {
            editor
              .chain()
              .focus()
              .insertContent(
                variable.isRawHtml
                  ? { type: "variableBlock", attrs: { path: variable.path } }
                  : { type: "variableChip", attrs: { path: variable.path } },
              )
              .run();
          }}
        />
        <select
          className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
          disabled={disabled}
          value=""
          onChange={(event) => {
            const section = CONTRACT_SECTIONS.find((s) => s.id === event.target.value);
            if (section) {
              appendTopLevelBlocks(editor, section.content);
            }
            event.target.value = "";
          }}
          aria-label={t("documentTemplateBuilder.addSection")}
        >
          <option value="" disabled>
            {t("documentTemplateBuilder.addSection")}
          </option>
          {CONTRACT_SECTIONS.map((section) => (
            <option key={section.id} value={section.id}>
              {t(section.labelKey)}
            </option>
          ))}
        </select>
      </div>

      <SectionList
        editor={editor}
        disabled={!!disabled}
        count={topLevelCount}
        onMove={(index, direction) => moveTopLevelNode(editor, index, direction)}
        onRemove={(index) => removeTopLevelNode(editor, index)}
      />

      <EditorContent editor={editor} className="doc-builder-canvas" />
    </div>
  );
}
