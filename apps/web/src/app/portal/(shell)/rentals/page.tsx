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
import { usePortalMe } from "../../../../hooks/use-portal-auth";
import { usePortalRentals } from "../../../../hooks/use-portal-rentals";
import { formatDate } from "../../../../lib/date-format";
import { formatMoney } from "../../../../lib/money";
import type { PortalRentalListItem } from "../../../../types/portal";
import type { RentalStatus } from "../../../../types/rental";

const STATUSES: RentalStatus[] = [
  "DRAFT",
  "QUOTE",
  "RESERVED",
  "ACTIVE",
  "RETURNED",
  "COMPLETED",
  "CANCELLED",
];

export default function PortalRentalsPage() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<RentalStatus | "">("");
  const { data: me } = usePortalMe();
  const timeZone = me?.tenant?.timezone;

  const table = useDataTableState({ initialSortBy: "createdAt", initialSortDirection: "desc" });
  const { data, isLoading, isError, refetch } = usePortalRentals({
    page: table.page,
    pageSize: table.pageSize,
    status: status || undefined,
    sortBy: table.sort.sortBy ?? "createdAt",
    sortDirection: table.sort.sortDirection,
  });

  const columns: DataTableColumn<PortalRentalListItem>[] = [
    {
      id: "rentalNumber",
      header: t("rental.fields.rentalNumber"),
      sortable: true,
      cell: (rental) => rental.rentalNumber,
      mobileRole: "primary",
    },
    {
      id: "status",
      header: t("rental.fields.status"),
      cell: (rental) => t(`portal.rentals.statuses.${rental.status}`),
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
      <div>
        <h1 className="text-2xl font-semibold">{t("portal.rentals.title")}</h1>
      </div>

      <FilterBar
        activeFilters={
          status
            ? [
                {
                  id: "status",
                  label: t(`portal.rentals.statuses.${status}`),
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
            setStatus(event.target.value as RentalStatus | "");
            table.resetToFirstPage();
          }}
        >
          <option value="">{t("portal.rentals.allStatuses")}</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`portal.rentals.statuses.${value}`)}
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
        emptyState={
          <p className="text-muted-foreground text-sm">{t("portal.rentals.noRentals")}</p>
        }
        rowHref={(rental) => `/portal/rentals/${rental.id}`}
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
