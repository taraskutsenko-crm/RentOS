"use client";

import { Button } from "@rentos/ui";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../../../components/shell/page-header";
import {
  DataTable,
  DataTablePagination,
  FilterBar,
  SearchInput,
  useDataTableState,
  type DataTableColumn,
} from "../../../../components/data-table";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { usePermission } from "../../../../hooks/use-current-tenant-role";
import { useDocumentTemplates } from "../../../../hooks/use-document-templates";
import type {
  DocumentTemplateListItem,
  DocumentTemplateStatus,
  DocumentType,
} from "../../../../types/document";

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
  const [documentType, setDocumentType] = useState<DocumentType | "">("");
  const [status, setStatus] = useState<DocumentTemplateStatus | "">("");

  const canManage = usePermission("documents.templates.manage");
  const table = useDataTableState();
  const { data, isLoading, isError, refetch } = useDocumentTemplates(tenantId, {
    page: table.page,
    pageSize: table.pageSize,
    search: table.search || undefined,
    documentType: documentType || undefined,
    status: status || undefined,
  });

  const activeFilters = [
    ...(documentType
      ? [
          {
            id: "documentType",
            label: t(`document.types.${documentType}`),
            onRemove: () => {
              setDocumentType("");
              table.resetToFirstPage();
            },
          },
        ]
      : []),
    ...(status
      ? [
          {
            id: "status",
            label: t(`documentTemplate.statuses.${status}`),
            onRemove: () => {
              setStatus("");
              table.resetToFirstPage();
            },
          },
        ]
      : []),
  ];

  const columns: DataTableColumn<DocumentTemplateListItem>[] = [
    {
      id: "name",
      header: t("documentTemplate.fields.name"),
      cell: (template) => template.name,
      mobileRole: "primary",
    },
    {
      id: "documentType",
      header: t("document.fields.documentType"),
      cell: (template) => t(`document.types.${template.documentType}`),
      mobileRole: "secondary",
    },
    {
      id: "status",
      header: t("documentTemplate.fields.status"),
      cell: (template) => t(`documentTemplate.statuses.${template.status}`),
      mobileRole: "secondary",
    },
    {
      id: "versionCount",
      header: t("documentTemplate.fields.versionCount"),
      cell: (template) => template.versionCount,
      align: "right",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("documentTemplate.title")}
        subtitle={t("documentTemplate.subtitle")}
        secondaryActions={
          <Button asChild variant="outline">
            <Link href="/app/documents">{t("document.title")}</Link>
          </Button>
        }
        primaryAction={
          canManage && (
            <Button asChild>
              <Link href="/app/documents/templates/new">{t("documentTemplate.newTemplate")}</Link>
            </Button>
          )
        }
      />

      <FilterBar activeFilters={activeFilters}>
        <SearchInput
          value={table.searchInput}
          onChange={table.setSearchInput}
          placeholder={t("documentTemplate.searchPlaceholder")}
          className="max-w-sm flex-1"
        />
        <select
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          value={documentType}
          onChange={(event) => {
            setDocumentType(event.target.value as DocumentType | "");
            table.resetToFirstPage();
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
            table.resetToFirstPage();
          }}
        >
          <option value="">{t("document.allStatuses")}</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`documentTemplate.statuses.${value}`)}
            </option>
          ))}
        </select>
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.items}
        getRowId={(template) => template.id}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyState={
          <p className="text-muted-foreground text-sm">{t("documentTemplate.noTemplates")}</p>
        }
        rowHref={(template) => `/app/documents/templates/${template.id}`}
      />

      {data && (
        <DataTablePagination
          page={table.page}
          pageSize={table.pageSize}
          total={data.total}
          onPageChange={table.goToPage}
        />
      )}
    </div>
  );
}
