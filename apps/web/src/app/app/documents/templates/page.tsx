"use client";

import { Button, Card, CardContent, Input } from "@rentos/ui";
import Link from "next/link";
import { useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { usePermission } from "../../../../hooks/use-current-tenant-role";
import { useDocumentTemplates } from "../../../../hooks/use-document-templates";
import type { DocumentTemplateStatus, DocumentType } from "../../../../types/document";

const PAGE_SIZE = 20;
const DOCUMENT_TYPES: DocumentType[] = [
  "QUOTE",
  "CONTRACT",
  "HANDOVER_PROTOCOL",
  "RETURN_PROTOCOL",
  "DAMAGE_REPORT",
  "CONTRACT_AMENDMENT",
  "CUSTOM",
];
const STATUSES: DocumentTemplateStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];

export default function DocumentTemplatesPage() {
  const { t } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType | "">("");
  const [status, setStatus] = useState<DocumentTemplateStatus | "">("");

  const canManage = usePermission("documents.templates.manage");
  const { data, isLoading, isError } = useDocumentTemplates(tenantId, {
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    documentType: documentType || undefined,
    status: status || undefined,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>): void {
    setSearch(event.target.value);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("documentTemplate.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("documentTemplate.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/app/documents">{t("document.title")}</Link>
          </Button>
          {canManage && (
            <Button asChild>
              <Link href="/app/documents/templates/new">{t("documentTemplate.newTemplate")}</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder={t("documentTemplate.searchPlaceholder")}
          value={search}
          onChange={handleSearchChange}
          className="max-w-sm"
        />
        <select
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          value={documentType}
          onChange={(event) => {
            setDocumentType(event.target.value as DocumentType | "");
            setPage(1);
          }}
        >
          <option value="">{t("document.allTypes")}</option>
          {DOCUMENT_TYPES.map((value) => (
            <option key={value} value={value}>
              {t(`document.types.${value}`)}
            </option>
          ))}
        </select>
        <select
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as DocumentTemplateStatus | "");
            setPage(1);
          }}
        >
          <option value="">{t("document.allStatuses")}</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`documentTemplate.statuses.${value}`)}
            </option>
          ))}
        </select>
      </div>

      {isError && <p className="text-destructive text-sm">{t("common.error")}</p>}

      <Card>
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex flex-col gap-2 p-6">
              {[0, 1, 2].map((row) => (
                <div key={row} className="bg-muted h-10 animate-pulse rounded-md" />
              ))}
            </div>
          )}
          {!isLoading && data?.items.length === 0 && (
            <p className="text-muted-foreground p-6 text-sm">{t("documentTemplate.noTemplates")}</p>
          )}
          {!isLoading && data && data.items.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3 font-medium">{t("documentTemplate.fields.name")}</th>
                  <th className="p-3 font-medium">{t("document.fields.documentType")}</th>
                  <th className="p-3 font-medium">{t("documentTemplate.fields.status")}</th>
                  <th className="p-3 font-medium">{t("documentTemplate.fields.versionCount")}</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((template) => (
                  <tr key={template.id} className="border-b last:border-0">
                    <td className="p-3">{template.name}</td>
                    <td className="p-3">{t(`document.types.${template.documentType}`)}</td>
                    <td className="p-3">{t(`documentTemplate.statuses.${template.status}`)}</td>
                    <td className="p-3">{template.versionCount}</td>
                    <td className="p-3 text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/app/documents/templates/${template.id}`}>
                          {t("asset.view")}
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            {t("customer.previous")}
          </Button>
          <span className="text-muted-foreground text-sm">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            {t("customer.next")}
          </Button>
        </div>
      )}
    </div>
  );
}
