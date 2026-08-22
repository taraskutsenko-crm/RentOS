"use client";

import { Button, Select } from "@rentos/ui";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { DashboardGrid, DashboardMetric } from "../../../components/dashboard";
import {
  DataTable,
  DataTablePagination,
  FilterBar,
  SearchInput,
  useDataTableState,
  type DataTableColumn,
} from "../../../components/data-table";
import { InvoiceStatusBadge } from "../../../components/invoices/invoice-status-badge";
import { PageHeader } from "../../../components/shell/page-header";
import { useCurrentTenantId } from "../../../hooks/use-current-tenant";
import { usePermission } from "../../../hooks/use-current-tenant-role";
import { useInvoices } from "../../../hooks/use-invoices";
import { formatBusinessDate } from "../../../lib/date-format";
import { formatMoney } from "../../../lib/money";
import type { Invoice, InvoiceStatus } from "../../../types/invoice";

const STATUSES: InvoiceStatus[] = [
  "DRAFT",
  "ISSUED",
  "SENT",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "CANCELLED",
  "CORRECTED",
];

export default function InvoicesPage() {
  const { t, i18n } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const [status, setStatus] = useState<InvoiceStatus | "">("");

  const canCreate = usePermission("invoices.create");
  const table = useDataTableState({ initialSortBy: "createdAt", initialSortDirection: "desc" });
  const { data, isLoading, isError, refetch } = useInvoices(tenantId, {
    page: table.page,
    pageSize: table.pageSize,
    search: table.search || undefined,
    status: status || undefined,
    sortBy: table.sort.sortBy ?? "createdAt",
    sortDirection: table.sort.sortDirection,
  });

  const unpaidQuery = useInvoices(tenantId, { pageSize: 1, status: "SENT" });
  const overdueQuery = useInvoices(tenantId, { pageSize: 1, status: "OVERDUE" });
  const paidQuery = useInvoices(tenantId, { pageSize: 1, status: "PAID" });

  const columns: DataTableColumn<Invoice>[] = [
    {
      id: "invoiceNumber",
      header: t("invoice.fields.invoiceNumber"),
      sortable: true,
      cell: (invoice) =>
        invoice.status === "DRAFT" ? t("invoice.draftLabel") : invoice.invoiceNumber,
      mobileRole: "primary",
    },
    {
      id: "customer",
      header: t("customer.title"),
      cell: (invoice) =>
        invoice.customer
          ? invoice.customer.company || `${invoice.customer.firstName} ${invoice.customer.lastName}`
          : "—",
      mobileRole: "secondary",
    },
    {
      id: "issueDate",
      header: t("invoice.fields.issueDate"),
      sortable: true,
      cell: (invoice) => formatBusinessDate(invoice.issueDate, i18n.language),
    },
    {
      id: "dueDate",
      header: t("invoice.fields.dueDate"),
      sortable: true,
      cell: (invoice) =>
        invoice.dueDate ? formatBusinessDate(invoice.dueDate, i18n.language) : "—",
    },
    {
      id: "totalMinor",
      header: t("invoice.fields.total"),
      sortable: true,
      cell: (invoice) => formatMoney(invoice.totalMinor, invoice.currency),
    },
    {
      id: "status",
      header: t("invoice.fields.status"),
      sortable: true,
      cell: (invoice) => <InvoiceStatusBadge status={invoice.status} />,
      mobileRole: "secondary",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("invoice.title")}
        subtitle={t("invoice.subtitle")}
        primaryAction={
          canCreate && (
            <Button asChild>
              <Link href="/app/invoices/new">{t("invoice.newInvoice")}</Link>
            </Button>
          )
        }
      />

      <DashboardGrid>
        <DashboardMetric
          label={t("invoice.summary.total")}
          value={data?.total ?? 0}
          isLoading={isLoading}
        />
        <DashboardMetric
          label={t("invoice.summary.sent")}
          value={unpaidQuery.data?.total ?? 0}
          isLoading={unpaidQuery.isLoading}
        />
        <DashboardMetric
          label={t("invoice.summary.overdue")}
          value={overdueQuery.data?.total ?? 0}
          isLoading={overdueQuery.isLoading}
        />
        <DashboardMetric
          label={t("invoice.summary.paid")}
          value={paidQuery.data?.total ?? 0}
          isLoading={paidQuery.isLoading}
        />
      </DashboardGrid>

      <FilterBar
        activeFilters={
          status
            ? [
                {
                  id: "status",
                  label: t(`invoice.statuses.${status}`),
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
          placeholder={t("invoice.searchPlaceholder")}
          className="max-w-sm flex-1"
        />
        <Select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as InvoiceStatus | "");
            table.resetToFirstPage();
          }}
        >
          <option value="">{t("invoice.allStatuses")}</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`invoice.statuses.${value}`)}
            </option>
          ))}
        </Select>
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.data}
        getRowId={(invoice) => invoice.id}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyState={<p className="text-muted-foreground text-sm">{t("invoice.noInvoices")}</p>}
        rowHref={(invoice) => `/app/invoices/${invoice.id}`}
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
