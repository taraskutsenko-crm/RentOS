"use client";

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@rentos/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { TemplateBuilder } from "../../../../../components/documents/template-builder/template-builder";
import { ConfirmDialog } from "../../../../../components/data-table/confirm-dialog";
import {
  useCreateDocumentTemplate,
  usePreviewDocumentTemplate,
} from "../../../../../hooks/use-document-templates";
import { useCurrentTenantId } from "../../../../../hooks/use-current-tenant";
import { apiErrorMessage } from "../../../../../lib/api-error-i18n";
import type { BlockNode } from "../../../../../lib/contract-section-library";
import {
  fullContractBlocks,
  renderBlocksToHtml,
} from "../../../../../lib/contract-section-library";
import { toBlocksV1Schema } from "../../../../../lib/document-template-editor-format";
import type { DocumentType } from "../../../../../types/document";

type EditorMode = "visual" | "advanced";

/**
 * Tiptap normalizes its content once at mount to satisfy the schema (e.g.
 * an empty starting section gets an implicit empty paragraph), which fires
 * `onChange` even though the user hasn't typed anything — so `blocks` alone
 * can't tell "untouched" from "edited." Stripped rendered text is a more
 * reliable signal: still empty after normalization, non-empty once the
 * user types or inserts a field/section.
 */
function isBlocksEffectivelyEmpty(blocks: BlockNode[] | null): boolean {
  if (!blocks || blocks.length === 0) return true;
  return (
    renderBlocksToHtml(blocks)
      .replace(/<[^>]*>/g, "")
      .trim().length === 0
  );
}

const DOCUMENT_TYPES: DocumentType[] = [
  "QUOTE",
  "CONTRACT",
  "HANDOVER_PROTOCOL",
  "RETURN_PROTOCOL",
  "DAMAGE_REPORT",
  "CONTRACT_AMENDMENT",
  "CUSTOM",
];

export default function NewDocumentTemplatePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [tenantId] = useCurrentTenantId();
  const createTemplate = useCreateDocumentTemplate(tenantId);
  const previewTemplate = usePreviewDocumentTemplate(tenantId);

  const [documentType, setDocumentType] = useState<DocumentType>("CONTRACT");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<EditorMode>("visual");
  const [blocks, setBlocks] = useState<BlockNode[] | null>(null);
  const [htmlContent, setHtmlContent] = useState(
    "<h1>{{company.name}}</h1>\n<p>{{customer.name}}</p>\n<p>{{today}}</p>",
  );
  const [css, setCss] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [showStarterConfirm, setShowStarterConfirm] = useState(false);
  // Bumped whenever the starter template is applied, forcing TemplateBuilder
  // to remount — its Tiptap editor only reads `initialBlocks` at mount time,
  // so replacing `blocks` alone wouldn't refresh the already-rendered canvas.
  const [builderKey, setBuilderKey] = useState(0);

  function applyStarterTemplate(): void {
    setBlocks(fullContractBlocks());
    setBuilderKey((key) => key + 1);
    setShowStarterConfirm(false);
  }

  function handleStartFromTemplate(): void {
    if (isBlocksEffectivelyEmpty(blocks)) {
      applyStarterTemplate();
    } else {
      setShowStarterConfirm(true);
    }
  }

  async function handlePreview(): Promise<void> {
    setError(null);
    try {
      const result = await previewTemplate.mutateAsync(
        mode === "visual"
          ? { documentType, htmlContent: renderBlocksToHtml(blocks ?? []), css: null }
          : { documentType, htmlContent, css: css || null },
      );
      setPreviewHtml(result.html);
    } catch (previewError) {
      setError(apiErrorMessage(previewError, t("common.error")));
    }
  }

  async function handleSubmit(): Promise<void> {
    setError(null);
    try {
      const template = await createTemplate.mutateAsync(
        mode === "visual"
          ? {
              documentType,
              name,
              description: description || null,
              htmlContent: renderBlocksToHtml(blocks ?? []),
              css: null,
              variablesSchema: toBlocksV1Schema(blocks ?? []),
            }
          : {
              documentType,
              name,
              description: description || null,
              htmlContent,
              css: css || null,
            },
      );
      router.push(`/app/documents/templates/${template.id}`);
    } catch (submitError) {
      setError(apiErrorMessage(submitError, t("common.error")));
    }
  }

  const contentIsEmpty = mode === "visual" ? !blocks?.length : !htmlContent;

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>{t("documentTemplate.newTemplate")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="documentType">{t("document.fields.documentType")}</Label>
              <select
                id="documentType"
                className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value as DocumentType)}
              >
                {DOCUMENT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {t(`document.types.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">{t("documentTemplate.fields.name")}</Label>
              <Input id="name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">{t("documentTemplate.fields.description")}</Label>
            <textarea
              id="description"
              className="border-input min-h-16 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "visual" ? "default" : "outline"}
              onClick={() => setMode("visual")}
            >
              {t("documentTemplate.editorMode.visual")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "advanced" ? "default" : "outline"}
              onClick={() => setMode("advanced")}
            >
              {t("documentTemplate.editorMode.advanced")}
            </Button>
            {mode === "visual" && documentType === "CONTRACT" && (
              <Button type="button" size="sm" variant="outline" onClick={handleStartFromTemplate}>
                {t("documentTemplate.actions.startFromTemplate")}
              </Button>
            )}
          </div>

          {mode === "visual" ? (
            <TemplateBuilder key={builderKey} initialBlocks={blocks} onChange={setBlocks} />
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="htmlContent">{t("documentTemplate.fields.htmlContent")}</Label>
                <textarea
                  id="htmlContent"
                  className="border-input min-h-64 rounded-md border bg-transparent px-3 py-2 font-mono text-xs shadow-xs"
                  value={htmlContent}
                  onChange={(event) => setHtmlContent(event.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="css">{t("documentTemplate.fields.css")}</Label>
                <textarea
                  id="css"
                  className="border-input min-h-32 rounded-md border bg-transparent px-3 py-2 font-mono text-xs shadow-xs"
                  value={css}
                  onChange={(event) => setCss(event.target.value)}
                />
              </div>
            </>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={contentIsEmpty || previewTemplate.isPending}
                onClick={() => void handlePreview()}
              >
                {previewTemplate.isPending
                  ? t("common.loading")
                  : t("documentTemplate.sections.preview")}
              </Button>
              <p className="text-muted-foreground text-xs">
                {t("documentTemplate.previewSampleDataHint")}
              </p>
            </div>
            {previewHtml && (
              <iframe
                title={t("documentTemplate.sections.preview")}
                srcDoc={previewHtml}
                className="h-[500px] w-full rounded-md border bg-white"
              />
            )}
          </div>

          <Button
            disabled={!name || contentIsEmpty || createTemplate.isPending}
            onClick={() => void handleSubmit()}
          >
            {createTemplate.isPending ? t("documentTemplate.saving") : t("documentTemplate.save")}
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showStarterConfirm}
        onOpenChange={setShowStarterConfirm}
        title={t("documentTemplate.startFromTemplateConfirm.title")}
        description={t("documentTemplate.startFromTemplateConfirm.description")}
        destructive
        onConfirm={applyStarterTemplate}
      />
    </div>
  );
}
