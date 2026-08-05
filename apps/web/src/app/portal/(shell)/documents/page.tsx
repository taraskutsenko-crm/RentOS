"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  DataTable,
  DataTablePagination,
  FilterBar,
  useDataTableState,
  type DataTableColumn,
} from "../../../../components/data-table";
import { usePortalDocuments } from "../../../../hooks/use-portal-documents";
import type { PortalDocumentListItem } from "../../../../types/portal";
import type { DocumentStatus } from "../../../../types/document";

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

export default function PortalDocumentsPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<DocumentStatus | "">("");

  const table = useDataTableState();
  const { data, isLoading, isError, refetch } = usePortalDocuments({
    page: table.page,
    pageSize: table.pageSize,
    status: status || undefined,
  });

  const columns: DataTableColumn<PortalDocumentListItem>[] = [
    {
      id: "title",
      header: t("document.fields.documentNumber"),
      cell: (doc) => doc.title ?? doc.documentNumber,
      mobileRole: "primary",
    },
    {
      id: "documentType",
      header: t("document.fields.documentType"),
      cell: (doc) =>
        doc.documentType === "CUSTOM"
          ? (doc.customTypeName ?? t("document.types.CUSTOM"))
          : t(`document.types.${doc.documentType}`),
      mobileRole: "secondary",
    },
    {
      id: "status",
      header: t("document.fields.status"),
      cell: (doc) => t(`document.statuses.${doc.status}`),
      mobileRole: "secondary",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("portal.documents.title")}</h1>
      </div>

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
        <select
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as DocumentStatus | "");
            table.resetToFirstPage();
          }}
        >
          <option value="">{t("portal.documents.allStatuses")}</option>
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
        getRowId={(doc) => doc.id}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyState={
          <p className="text-muted-foreground text-sm">{t("portal.documents.noDocuments")}</p>
        }
        rowHref={(doc) => `/portal/documents/${doc.id}`}
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
