"use client";

import { Button } from "@rentos/ui";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { QuoteStatusBadge } from "../../../components/quotes/quote-status-badge";
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
import { useQuotes } from "../../../hooks/use-quotes";
import { formatBusinessDate } from "../../../lib/date-format";
import { formatMoney } from "../../../lib/money";
import type { QuoteListItem, QuoteStatus } from "../../../types/quote";

const STATUSES: QuoteStatus[] = [
  "DRAFT",
  "SENT",
  "VIEWED",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CONVERTED",
  "CANCELLED",
];

export default function QuotesPage() {
  const { t, i18n } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const [status, setStatus] = useState<QuoteStatus | "">("");

  const canCreate = usePermission("quotes.create");
  const table = useDataTableState({ initialSortBy: "createdAt", initialSortDirection: "desc" });
  const { data, isLoading, isError, refetch } = useQuotes(tenantId, {
    page: table.page,
    pageSize: table.pageSize,
    search: table.search || undefined,
    status: status || undefined,
    sortBy: table.sort.sortBy ?? "createdAt",
    sortDirection: table.sort.sortDirection,
  });

  const columns: DataTableColumn<QuoteListItem>[] = [
    {
      id: "quoteNumber",
      header: t("quote.fields.quoteNumber"),
      sortable: true,
      cell: (quote) => quote.quoteNumber,
      mobileRole: "primary",
    },
    {
      id: "customer",
      header: t("customer.title"),
      cell: (quote) => `${quote.customer.firstName} ${quote.customer.lastName}`,
      mobileRole: "secondary",
    },
    {
      id: "status",
      header: t("quote.fields.status"),
      cell: (quote) => <QuoteStatusBadge status={quote.status} />,
      mobileRole: "secondary",
    },
    {
      id: "validUntil",
      header: t("quote.fields.validUntil"),
      sortable: true,
      cell: (quote) => formatBusinessDate(quote.validUntil, i18n.language),
    },
    {
      id: "total",
      header: t("rental.fields.total"),
      sortable: true,
      sortKey: "totalMinor",
      align: "right",
      cell: (quote) => formatMoney(quote.totalMinor, quote.currency),
      mobileRole: "secondary",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("quote.title")}
        subtitle={t("quote.subtitle")}
        primaryAction={
          canCreate && (
            <Button asChild>
              <Link href="/app/quotes/new">{t("quote.newQuote")}</Link>
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
                  label: t(`quote.statuses.${status}`),
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
          placeholder={t("quote.searchPlaceholder")}
          className="max-w-sm flex-1"
        />
        <select
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as QuoteStatus | "");
            table.resetToFirstPage();
          }}
        >
          <option value="">{t("quote.allStatuses")}</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`quote.statuses.${value}`)}
            </option>
          ))}
        </select>
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.items}
        getRowId={(quote) => quote.id}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyState={<p className="text-muted-foreground text-sm">{t("quote.noQuotes")}</p>}
        rowHref={(quote) => `/app/quotes/${quote.id}`}
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
