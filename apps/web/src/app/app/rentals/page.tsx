"use client";

import { Button } from "@rentos/ui";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { RentalAttentionBadge } from "../../../components/rentals/rental-attention-badge";
import { RentalStatusBadge } from "../../../components/rentals/rental-status-badge";
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
import { usePermission, useTenantTimezone } from "../../../hooks/use-current-tenant-role";
import { useRentals, type RentalAttentionFilter } from "../../../hooks/use-rentals";
import { formatDate } from "../../../lib/date-format";
import { formatMoney } from "../../../lib/money";
import type { RentalListItem, RentalStatus } from "../../../types/rental";

const ATTENTION_FILTERS: RentalAttentionFilter[] = ["overdue", "endingToday", "endingTomorrow"];

function isRentalAttentionFilter(value: string | null): value is RentalAttentionFilter {
  return !!value && (ATTENTION_FILTERS as string[]).includes(value);
}

const STATUSES: RentalStatus[] = [
  "DRAFT",
  "QUOTE",
  "RESERVED",
  "ACTIVE",
  "RETURNED",
  "COMPLETED",
  "CANCELLED",
];

export default function RentalsPage() {
  const { t, i18n } = useTranslation();
  const [tenantId] = useCurrentTenantId();

  const canCreate = usePermission("rentals.create");
  const timeZone = useTenantTimezone();
  const table = useDataTableState({ initialSortBy: "createdAt", initialSortDirection: "desc" });
  const [status, setStatus] = useState<RentalStatus | "">("");
  // One-directional read of ?attention= on load — lets a Dashboard
  // "Rental attention" card link straight into a filtered list (Task A4).
  // Not a full bidirectional URL sync (the rest of this page's filters
  // aren't URL-persisted either); this only covers the click-through entry
  // point.
  // useSearchParams() can return null outside a router context (e.g. tests
  // that render this page directly without Next's app router) — never
  // assume it's non-null.
  const searchParams = useSearchParams();
  const [attention, setAttention] = useState<RentalAttentionFilter | "">(() => {
    const fromUrl = searchParams?.get("attention") ?? null;
    return isRentalAttentionFilter(fromUrl) ? fromUrl : "";
  });

  const { data, isLoading, isError, refetch } = useRentals(tenantId, {
    page: table.page,
    pageSize: table.pageSize,
    search: table.search || undefined,
    status: status || undefined,
    attention: attention || undefined,
    sortBy: table.sort.sortBy ?? "createdAt",
    sortDirection: table.sort.sortDirection,
  });

  const columns: DataTableColumn<RentalListItem>[] = [
    {
      id: "rentalNumber",
      header: t("rental.fields.rentalNumber"),
      sortable: true,
      cell: (rental) => rental.rentalNumber,
      mobileRole: "primary",
    },
    {
      id: "customer",
      header: t("customer.title"),
      cell: (rental) => `${rental.customer.firstName} ${rental.customer.lastName}`,
      mobileRole: "secondary",
    },
    {
      id: "status",
      header: t("rental.fields.status"),
      cell: (rental) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <RentalStatusBadge status={rental.status} />
          {rental.attention && (
            <RentalAttentionBadge
              attention={rental.attention}
              plannedEnd={rental.plannedEnd}
              overdueSince={rental.overdueSince}
              locale={i18n.language}
              timeZone={timeZone}
            />
          )}
        </div>
      ),
      mobileRole: "secondary",
    },
    {
      id: "plannedStart",
      header: t("rental.fields.plannedStart"),
      sortable: true,
      cell: (rental) => formatDate(rental.plannedStart, i18n.language, timeZone),
    },
    {
      id: "plannedEnd",
      header: t("rental.fields.plannedEnd"),
      sortable: true,
      cell: (rental) => formatDate(rental.plannedEnd, i18n.language, timeZone),
    },
    {
      id: "total",
      header: t("rental.fields.total"),
      sortable: true,
      sortKey: "totalMinor",
      align: "right",
      cell: (rental) => formatMoney(rental.totalMinor, rental.currency),
      mobileRole: "secondary",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("rental.title")}
        subtitle={t("rental.subtitle")}
        secondaryActions={
          <Button asChild variant="outline">
            <Link href="/app/rentals/availability">{t("rental.availabilityCalendar.title")}</Link>
          </Button>
        }
        primaryAction={
          canCreate && (
            <Button asChild>
              <Link href="/app/rentals/new">{t("rental.newRental")}</Link>
            </Button>
          )
        }
      />

      <FilterBar
        activeFilters={[
          ...(status
            ? [
                {
                  id: "status",
                  label: t(`rental.statuses.${status}`),
                  onRemove: () => {
                    setStatus("");
                    table.resetToFirstPage();
                  },
                },
              ]
            : []),
          ...(attention
            ? [
                {
                  id: "attention",
                  label: t(`rental.attention.filter.${attention}`),
                  onRemove: () => {
                    setAttention("");
                    table.resetToFirstPage();
                  },
                },
              ]
            : []),
        ]}
      >
        <SearchInput
          value={table.searchInput}
          onChange={table.setSearchInput}
          placeholder={t("rental.searchPlaceholder")}
          className="max-w-sm flex-1"
        />
        <select
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as RentalStatus | "");
            table.resetToFirstPage();
          }}
        >
          <option value="">{t("rental.allStatuses")}</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`rental.statuses.${value}`)}
            </option>
          ))}
        </select>
        <select
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          value={attention}
          onChange={(event) => {
            const value = event.target.value;
            setAttention(isRentalAttentionFilter(value) ? value : "");
            table.resetToFirstPage();
          }}
        >
          <option value="">{t("rental.attention.filter.any")}</option>
          {ATTENTION_FILTERS.map((value) => (
            <option key={value} value={value}>
              {t(`rental.attention.filter.${value}`)}
            </option>
          ))}
        </select>
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.items}
        getRowId={(rental) => rental.id}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyState={<p className="text-muted-foreground text-sm">{t("rental.noRentals")}</p>}
        rowHref={(rental) => `/app/rentals/${rental.id}`}
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
