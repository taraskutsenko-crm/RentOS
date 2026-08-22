import { Injectable } from "@nestjs/common";
import type { DocumentType } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";
import { DocumentTemplatesService } from "../document-templates.service";
import type { DocumentDetailView, DocumentVersionWithFiles } from "../document.types";
import { BASE_DOCUMENT_CSS } from "./base-document-css";
import { resolveDefaultDocumentLanguage } from "./document-language-resolver.util";
import { getDefaultTemplate } from "./default-templates";
import { resolveVariables, VariableResolverService } from "./variable-resolver.service";

export interface RenderedHtml {
  html: string;
  /** Which content actually rendered — for the timeline/audit trail, never persisted itself (see ADR 0011). */
  templateId: string | null;
  templateSource: "explicit" | "tenant_active" | "built_in_default";
}

/**
 * Turns a Document + its business-data snapshot into a full HTML document —
 * "Never store generated HTML. Always regenerate from immutable snapshot"
 * (TASK-0008 Part 2): this service has no `store`/`save` method at all, on
 * purpose. Only PdfRendererService's output (via DocumentFile) is ever
 * persisted. See docs/adr/0011-document-rendering-and-sharing.md.
 */
@Injectable()
export class DocumentRendererService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templatesService: DocumentTemplatesService,
    private readonly variableResolver: VariableResolverService,
  ) {}

  async renderHtml(
    tenantId: string,
    document: DocumentDetailView,
    version: DocumentVersionWithFiles,
  ): Promise<RenderedHtml> {
    const { htmlContent, css, templateId, templateSource } = await this.resolveTemplateContent(
      tenantId,
      document,
      version,
    );

    const context = await this.variableResolver.buildContext(tenantId, document, version);
    const bodyHtml = resolveVariables(htmlContent, context);
    const html = wrapDocumentHtml(document.documentNumber, css, bodyHtml);

    return { html, templateId, templateSource };
  }

  /**
   * Renders unsaved draft HTML/CSS (the no-code builder's live preview,
   * before any Document exists) against synthetic sample data — same
   * substitution engine (`resolveVariables`) and the same document shell as
   * a real render, just a synthetic context instead of one built from a
   * persisted Document (see VariableResolverService#buildPreviewContext).
   */
  async renderPreviewHtml(
    tenantId: string,
    documentType: DocumentType,
    htmlContent: string,
    css: string | null,
  ): Promise<{ html: string }> {
    const context = await this.variableResolver.buildPreviewContext(tenantId, documentType);
    const bodyHtml = resolveVariables(htmlContent, context);
    return { html: wrapDocumentHtml("PREVIEW", css, bodyHtml) };
  }

  private async resolveTemplateContent(
    tenantId: string,
    document: DocumentDetailView,
    version: DocumentVersionWithFiles,
  ): Promise<{
    htmlContent: string;
    css: string | null;
    templateId: string | null;
    templateSource: RenderedHtml["templateSource"];
  }> {
    if (version.templateId) {
      const template = await this.templatesService.findOne(tenantId, version.templateId);
      // A version.templateVersionId pins the exact template content that
      // existed at the moment this Document version was created — editing
      // or archiving the template afterward must never change how an
      // already-generated document re-renders (see resolveTemplatePin in
      // DocumentsService and ARCHITECTURE_LOCK §1.6). Rows created before
      // this pinning existed have templateVersionId === null and keep
      // resolving the template's current version, exactly as before. This
      // is still the tenant's active template as of creation time — not a
      // distinct "explicit assignment" feature (none exists) — so it keeps
      // the same "tenant_active" source label the caller already expects.
      const pinned = version.templateVersionId
        ? template.versions.find((v) => v.id === version.templateVersionId)
        : undefined;
      const current =
        pinned ?? template.versions.find((v) => v.versionNumber === template.currentVersionNumber)!;
      return {
        htmlContent: current.htmlContent,
        css: current.css,
        templateId: template.id,
        templateSource: "tenant_active",
      };
    }

    // No pin was ever captured for this document version (no ACTIVE
    // template existed for any usable language at document-creation time —
    // see DocumentsService.resolveTemplatePin). Re-check now: a template
    // created and activated afterward should still be picked up, using the
    // exact same country-resolved-language-first policy as the pin itself
    // (see DECISIONS.md D-071/D-077) so a re-render never disagrees with
    // what a fresh document would have been pinned to.
    const resolvedLanguage = await this.resolveDocumentLanguage(tenantId);
    const active =
      (await this.templatesService.findActiveForType(
        tenantId,
        document.documentType,
        resolvedLanguage,
      )) ?? (await this.templatesService.findActiveForType(tenantId, document.documentType));
    if (active) {
      const current = active.versions.find((v) => v.versionNumber === active.currentVersionNumber)!;
      return {
        htmlContent: current.htmlContent,
        css: current.css,
        templateId: active.id,
        templateSource: "tenant_active",
      };
    }

    const fallback = getDefaultTemplate(document.documentType, resolvedLanguage);
    return {
      htmlContent: fallback.htmlContent,
      css: null,
      templateId: null,
      templateSource: "built_in_default",
    };
  }

  /** Same resolution DocumentsService.resolveTemplatePin/VariableResolverService use — company country first, never the viewer's UI language (see DECISIONS.md D-071/D-075). */
  private async resolveDocumentLanguage(tenantId: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { countryCode: true, defaultLanguage: true },
    });
    return resolveDefaultDocumentLanguage(tenant);
  }
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function wrapDocumentHtml(title: string, css: string | null, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtmlAttribute(title)}</title>
<style>
${BASE_DOCUMENT_CSS}
${css ?? ""}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
