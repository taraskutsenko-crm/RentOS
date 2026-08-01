import { Injectable } from "@nestjs/common";

import { DocumentTemplatesService } from "../document-templates.service";
import type { DocumentDetailView, DocumentVersionWithFiles } from "../document.types";
import { BASE_DOCUMENT_CSS } from "./base-document-css";
import { DEFAULT_TEMPLATES } from "./default-templates";
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

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtmlAttribute(document.documentNumber)}</title>
<style>
${BASE_DOCUMENT_CSS}
${css ?? ""}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

    return { html, templateId, templateSource };
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
      const current = template.versions.find(
        (v) => v.versionNumber === template.currentVersionNumber,
      )!;
      return {
        htmlContent: current.htmlContent,
        css: current.css,
        templateId: template.id,
        templateSource: "explicit",
      };
    }

    const active = await this.templatesService.findActiveForType(tenantId, document.documentType);
    if (active) {
      const current = active.versions.find((v) => v.versionNumber === active.currentVersionNumber)!;
      return {
        htmlContent: current.htmlContent,
        css: current.css,
        templateId: active.id,
        templateSource: "tenant_active",
      };
    }

    const fallback = DEFAULT_TEMPLATES[document.documentType];
    return {
      htmlContent: fallback.htmlContent,
      css: null,
      templateId: null,
      templateSource: "built_in_default",
    };
  }
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
