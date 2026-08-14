"use client";

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@rentos/ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { TemplateBuilder } from "../../../../../components/documents/template-builder/template-builder";
import { useCurrentTenantId } from "../../../../../hooks/use-current-tenant";
import { usePermission } from "../../../../../hooks/use-current-tenant-role";
import {
  useActivateDocumentTemplate,
  useArchiveDocumentTemplate,
  useDocumentTemplate,
  useDuplicateDocumentTemplate,
  usePreviewDocumentTemplate,
  useRestoreDocumentTemplate,
  useRestoreDocumentTemplateVersion,
  useUpdateDocumentTemplateContent,
  useUpdateDocumentTemplateMeta,
} from "../../../../../hooks/use-document-templates";
import { apiErrorMessage } from "../../../../../lib/api-error-i18n";
import type { BlockNode } from "../../../../../lib/contract-section-library";
import { renderBlocksToHtml } from "../../../../../lib/contract-section-library";
import { formatDateTime } from "../../../../../lib/date-format";
import {
  readBlocksV1Schema,
  toBlocksV1Schema,
} from "../../../../../lib/document-template-editor-format";
import type { DocumentTemplate } from "../../../../../types/document";

type EditorMode = "visual" | "advanced";

export default function DocumentTemplateDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [tenantId] = useCurrentTenantId();

  const { data: template, isLoading, isError } = useDocumentTemplate(tenantId, params.id);

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  if (isError || !template) {
    return <p className="text-destructive text-sm">{t("common.error")}</p>;
  }

  return <TemplateEditor key={template.id} tenantId={tenantId} template={template} />;
}

function TemplateEditor({
  tenantId,
  template,
}: {
  tenantId: string | null;
  template: DocumentTemplate;
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);

  const updateMeta = useUpdateDocumentTemplateMeta(tenantId);
  const updateContent = useUpdateDocumentTemplateContent(tenantId);
  const restoreVersion = useRestoreDocumentTemplateVersion(tenantId);
  const activate = useActivateDocumentTemplate(tenantId);
  const archive = useArchiveDocumentTemplate(tenantId);
  const restore = useRestoreDocumentTemplate(tenantId);
  const duplicate = useDuplicateDocumentTemplate(tenantId);
  const previewTemplate = usePreviewDocumentTemplate(tenantId);

  const canManage = usePermission("documents.templates.manage");

  const currentVersion = template.versions.find(
    (v) => v.versionNumber === template.currentVersionNumber,
  );

  // Local editable state is initialized once from `template` at mount time
  // (this component is remounted via `key={template.id}` whenever a
  // different template loads) rather than synchronized via an effect —
  // syncing local state from a prop in an effect is the classic
  // "derived state" anti-pattern React's own docs warn against.
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [htmlContent, setHtmlContent] = useState(currentVersion?.htmlContent ?? "");
  const [css, setCss] = useState(currentVersion?.css ?? "");

  // A version only opens in Visual mode if its variablesSchema is
  // recognized blocks-v1 JSON (authored by this same builder). Any other
  // shape — including every template created before this feature, and any
  // template whose content was last saved via the raw Advanced textarea —
  // has no block model to show, so it opens Advanced-only with no toggle,
  // per the plan's explicit "no destructive reverse-parsing of arbitrary
  // HTML" backward-compatibility rule.
  const initialVersionBlocks = readBlocksV1Schema(currentVersion?.variablesSchema);
  const supportsVisualMode = initialVersionBlocks !== null;
  const [mode, setMode] = useState<EditorMode>(supportsVisualMode ? "visual" : "advanced");
  const [blocks, setBlocks] = useState<BlockNode[] | null>(initialVersionBlocks);

  async function runAction(action: () => Promise<unknown>): Promise<void> {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(apiErrorMessage(error, t("common.error")));
    }
  }

  async function handleSaveMeta(): Promise<void> {
    await runAction(() =>
      updateMeta.mutateAsync({
        id: template.id,
        input: { name, description: description || null },
      }),
    );
  }

  async function handleSaveContent(): Promise<void> {
    await runAction(() =>
      updateContent.mutateAsync({
        id: template.id,
        input:
          mode === "visual"
            ? {
                htmlContent: renderBlocksToHtml(blocks ?? []),
                css: null,
                variablesSchema: toBlocksV1Schema(blocks ?? []),
              }
            : { htmlContent, css: css || null },
      }),
    );
  }

  const contentIsEmpty = mode === "visual" ? !blocks?.length : !htmlContent;
  const draftHtml = mode === "visual" ? renderBlocksToHtml(blocks ?? []) : htmlContent;
  const draftCss = mode === "visual" ? null : css || null;

  function handlePreview(): void {
    previewTemplate.mutate({
      documentType: template.documentType,
      htmlContent: draftHtml,
      css: draftCss,
    });
  }

  // Refresh the preview once when a template first loads, so the Preview
  // card shows resolved content immediately rather than staying empty
  // until the user clicks "Refresh preview". `mutate` (not `mutateAsync`)
  // reports its own pending/data/error via the mutation object itself
  // rather than a setState call we'd author here, which is what
  // react-hooks/set-state-in-effect requires of effect bodies.
  useEffect(() => {
    handlePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-runs when a different template loads
  }, [template.id]);

  async function handleDuplicate(): Promise<void> {
    await runAction(async () => {
      const duplicated = await duplicate.mutateAsync(template.id);
      router.push(`/app/documents/templates/${duplicated.id}`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{template.name}</h1>
          <p className="text-muted-foreground text-sm">
            {t(`document.types.${template.documentType}`)} ·{" "}
            {t(`documentTemplate.statuses.${template.status}`)}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {template.status !== "ACTIVE" && (
              <Button
                size="sm"
                onClick={() => void runAction(() => activate.mutateAsync(template.id))}
              >
                {t("documentTemplate.actions.activate")}
              </Button>
            )}
            {template.status !== "ARCHIVED" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runAction(() => archive.mutateAsync(template.id))}
              >
                {t("documentTemplate.actions.archive")}
              </Button>
            )}
            {template.status === "ARCHIVED" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runAction(() => restore.mutateAsync(template.id))}
              >
                {t("documentTemplate.actions.restore")}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void handleDuplicate()}>
              {t("documentTemplate.actions.duplicate")}
            </Button>
          </div>
        )}
      </div>

      {actionError && <p className="text-destructive text-sm">{actionError}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("documentTemplate.sections.metadata")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">{t("documentTemplate.fields.name")}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={!canManage}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="description">{t("documentTemplate.fields.description")}</Label>
                <textarea
                  id="description"
                  className="border-input min-h-16 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={!canManage}
                />
              </div>
              {canManage && (
                <Button size="sm" className="self-start" onClick={() => void handleSaveMeta()}>
                  {t("documentTemplate.save")}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("documentTemplate.sections.content")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {supportsVisualMode && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={mode === "visual" ? "default" : "outline"}
                    disabled={!canManage}
                    onClick={() => setMode("visual")}
                  >
                    {t("documentTemplate.editorMode.visual")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={mode === "advanced" ? "default" : "outline"}
                    disabled={!canManage}
                    onClick={() => setMode("advanced")}
                  >
                    {t("documentTemplate.editorMode.advanced")}
                  </Button>
                </div>
              )}

              {mode === "visual" ? (
                <TemplateBuilder
                  initialBlocks={blocks}
                  onChange={setBlocks}
                  disabled={!canManage}
                />
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="htmlContent">{t("documentTemplate.fields.htmlContent")}</Label>
                    <textarea
                      id="htmlContent"
                      className="border-input min-h-64 rounded-md border bg-transparent px-3 py-2 font-mono text-xs shadow-xs"
                      value={htmlContent}
                      onChange={(event) => setHtmlContent(event.target.value)}
                      disabled={!canManage}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="css">{t("documentTemplate.fields.css")}</Label>
                    <textarea
                      id="css"
                      className="border-input min-h-32 rounded-md border bg-transparent px-3 py-2 font-mono text-xs shadow-xs"
                      value={css}
                      onChange={(event) => setCss(event.target.value)}
                      disabled={!canManage}
                    />
                  </div>
                </>
              )}

              {canManage && (
                <Button
                  size="sm"
                  className="self-start"
                  disabled={contentIsEmpty}
                  onClick={() => void handleSaveContent()}
                >
                  {t("documentTemplate.actions.saveAsNewVersion")}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("documentTemplate.sections.preview")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={contentIsEmpty || previewTemplate.isPending}
                  onClick={handlePreview}
                >
                  {previewTemplate.isPending
                    ? t("common.loading")
                    : t("documentTemplate.actions.refreshPreview")}
                </Button>
                <p className="text-muted-foreground text-xs">
                  {t("documentTemplate.previewSampleDataHint")}
                </p>
              </div>
              {previewTemplate.isError && (
                <p className="text-destructive text-sm">
                  {apiErrorMessage(previewTemplate.error, t("common.error"))}
                </p>
              )}
              <iframe
                title={t("documentTemplate.sections.preview")}
                srcDoc={previewTemplate.data?.html ?? ""}
                className="h-[500px] w-full rounded-md border bg-white"
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("documentTemplate.sections.versions")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-3 text-sm">
              {[...template.versions]
                .sort((a, b) => b.versionNumber - a.versionNumber)
                .map((version) => (
                  <li
                    key={version.id}
                    className="flex items-center justify-between border-b pb-2 last:border-0"
                  >
                    <span>
                      {t("document.fields.version")} {version.versionNumber}
                      {version.versionNumber === template.currentVersionNumber &&
                        ` (${t("documentTemplate.fields.current")})`}
                      <br />
                      <span className="text-muted-foreground text-xs">
                        {formatDateTime(version.createdAt, i18n.language)}
                      </span>
                    </span>
                    {canManage && version.versionNumber !== template.currentVersionNumber && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void runAction(() =>
                            restoreVersion.mutateAsync({
                              id: template.id,
                              versionNumber: version.versionNumber,
                            }),
                          )
                        }
                      >
                        {t("documentTemplate.actions.restoreVersion")}
                      </Button>
                    )}
                  </li>
                ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <Link href="/app/documents/templates" className="text-muted-foreground text-sm underline">
        {t("document.backToList")}
      </Link>
    </div>
  );
}
