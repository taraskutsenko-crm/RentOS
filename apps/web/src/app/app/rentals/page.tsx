"use client";

import { Button } from "@rentos/ui";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";

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
import { usePermission } from "../../../hooks/use-current-tenant-role";
import { useRentals } from "../../../hooks/use-rentals";
import { formatBusinessDate } from "../../../lib/date-format";
import { formatMoney } from "../../../lib/money";
import type { RentalListItem, RentalStatus } from "../../../types/rental";

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
  const table = useDataTableState({ initialSortBy: "createdAt", initialSortDirection: "desc" });
  const [status, setStatus] = useState<RentalStatus | "">("");

  const { data, isLoading, isError, refetch } = useRentals(tenantId, {
    page: table.page,
    pageSize: table.pageSize,
    search: table.search || undefined,
    status: status || undefined,
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
      cell: (rental) => <RentalStatusBadge status={rental.status} />,
      mobileRole: "secondary",
    },
    {
      id: "plannedStart",
      header: t("rental.fields.plannedStart"),
      sortable: true,
      cell: (rental) => formatBusinessDate(rental.plannedStart, i18n.language),
    },
    {
      id: "plannedEnd",
      header: t("rental.fields.plannedEnd"),
      sortable: true,
      cell: (rental) => formatBusinessDate(rental.plannedEnd, i18n.language),
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
        activeFilters={
          status
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
            : []
        }
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
