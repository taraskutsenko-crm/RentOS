"use client";

import { Button } from "@rentos/ui";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../../components/shell/page-header";
import {
  DataTable,
  DataTablePagination,
  FilterBar,
  SearchInput,
  useDataTableState,
  type DataTableColumn,
} from "../../../components/data-table";
import { useCurrentTenantId } from "../../../hooks/use-current-tenant";
import { usePermission } from "../../../hooks/use-current-tenant-role";
import { useDocuments } from "../../../hooks/use-documents";
import type { DocumentListItem, DocumentStatus } from "../../../types/document";

const STATUSES: DocumentStatus[] = [
  "DRAFT",
  "READY",
  "SENT",
  "VIEWED",
  "PARTIALLY_SIGNED",
  "SIGNED",
  "REJECTED",
  "VOIDED",
  "ARCHIVED",
];

export default function DocumentsPage() {
  const { t } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const [status, setStatus] = useState<DocumentStatus | "">("");

  const canCreate = usePermission("documents.create");
  const table = useDataTableState({ initialSortBy: "createdAt", initialSortDirection: "desc" });
  const { data, isLoading, isError, refetch } = useDocuments(tenantId, {
    page: table.page,
    pageSize: table.pageSize,
    search: table.search || undefined,
    status: status || undefined,
    sortBy: table.sort.sortBy ?? "createdAt",
    sortDirection: table.sort.sortDirection,
  });

  const columns: DataTableColumn<DocumentListItem>[] = [
    {
      id: "documentNumber",
      header: t("document.fields.documentNumber"),
      sortable: true,
      cell: (document) => document.documentNumber,
      mobileRole: "primary",
    },
    {
      id: "documentType",
      header: t("document.fields.documentType"),
      sortable: true,
      cell: (document) =>
        document.documentType === "CUSTOM"
          ? (document.customTypeName ?? t("document.types.CUSTOM"))
          : t(`document.types.${document.documentType}`),
      mobileRole: "secondary",
    },
    {
      id: "customer",
      header: t("customer.title"),
      cell: (document) =>
        document.customer ? `${document.customer.firstName} ${document.customer.lastName}` : "—",
      mobileRole: "secondary",
    },
    {
      id: "status",
      header: t("document.fields.status"),
      sortable: true,
      cell: (document) => t(`document.statuses.${document.status}`),
      mobileRole: "secondary",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("document.title")}
        subtitle={t("document.subtitle")}
        secondaryActions={
          <Button asChild variant="outline">
            <Link href="/app/documents/templates">{t("documentTemplate.title")}</Link>
          </Button>
        }
        primaryAction={
          canCreate && (
            <Button asChild>
              <Link href="/app/documents/new">{t("document.newDocument")}</Link>
            </Button>
          )
        }
      />

      <FilterBar
        activeFilters={
          status
            ? [
                {
                  id: "status",
                  label: t(`document.statuses.${status}`),
                  onRemove: () => {
                    setStatus("");
                    table.resetToFirstPage();
                  },
                },
              ]
            : []
        }
      >
        <SearchInput
          value={table.searchInput}
          onChange={table.setSearchInput}
          placeholder={t("document.searchPlaceholder")}
          className="max-w-sm flex-1"
        />
        <select
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as DocumentStatus | "");
            table.resetToFirstPage();
          }}
        >
          <option value="">{t("document.allStatuses")}</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`document.statuses.${value}`)}
            </option>
          ))}
        </select>
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.items}
        getRowId={(document) => document.id}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyState={<p className="text-muted-foreground text-sm">{t("document.noDocuments")}</p>}
        rowHref={(document) => `/app/documents/${document.id}`}
        sort={table.sort}
        onSortChange={table.setSort}
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
