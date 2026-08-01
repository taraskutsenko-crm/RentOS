import type { DocumentTemplate, DocumentTemplateVersion, Prisma } from "@prisma/client";

export const DOCUMENT_TEMPLATE_DETAIL_INCLUDE = {
  versions: { orderBy: { versionNumber: "desc" } },
} satisfies Prisma.DocumentTemplateInclude;

export type DocumentTemplateDetailView = Prisma.DocumentTemplateGetPayload<{
  include: typeof DOCUMENT_TEMPLATE_DETAIL_INCLUDE;
}>;

export interface DocumentTemplateListItemView extends DocumentTemplate {
  versionCount: number;
}

export type { DocumentTemplate, DocumentTemplateVersion };
