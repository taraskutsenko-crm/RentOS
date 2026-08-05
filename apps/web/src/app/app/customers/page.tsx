"use client";

import { Button } from "@rentos/ui";
import Link from "next/link";
import { useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../../components/shell/page-header";
import {
  ConfirmDialog,
  DataTable,
  DataTablePagination,
  FilterBar,
  RowActionsMenu,
  SearchInput,
  useDataTableState,
  type ActiveFilter,
  type BulkAction,
  type DataTableColumn,
} from "../../../components/data-table";
import { useCurrentTenantId } from "../../../hooks/use-current-tenant";
import { useCustomers, useDeleteCustomer } from "../../../hooks/use-customers";
import type { Customer, CustomerStatus } from "../../../types/customer";

export default function CustomersPage() {
  const { t } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const [status, setStatus] = useState<CustomerStatus | "">("");
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);

  const table = useDataTableState();
  const { data, isLoading, isError, refetch } = useCustomers(tenantId, {
    page: table.page,
    pageSize: table.pageSize,
    search: table.search || undefined,
    status: status || undefined,
  });
  const deleteCustomer = useDeleteCustomer(tenantId);

  function handleStatusChange(event: ChangeEvent<HTMLSelectElement>): void {
    setStatus(event.target.value as CustomerStatus | "");
    table.resetToFirstPage();
  }

  async function handleDeleteConfirm(): Promise<void> {
    if (!deleteTarget) return;
    await deleteCustomer.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  }

  async function handleBulkDeleteConfirm(): Promise<void> {
    setBulkDeleteError(null);
    const ids = Array.from(table.selectedIds);
    const results = await Promise.allSettled(ids.map((id) => deleteCustomer.mutateAsync(id)));
    const failed = results.filter((result) => result.status === "rejected").length;
    if (failed > 0) {
      setBulkDeleteError(
        t("common.bulkActions.deletePartialFailure", { failed, total: ids.length }),
      );
    } else {
      setBulkDeleteOpen(false);
    }
    table.setSelectedIds(new Set());
  }

  const activeFilters: ActiveFilter[] = status
    ? [
        {
          id: "status",
          label: status === "ACTIVE" ? t("customer.statusActive") : t("customer.statusInactive"),
          onRemove: () => {
            setStatus("");
            table.resetToFirstPage();
          },
        },
      ]
    : [];

  const columns: DataTableColumn<Customer>[] = [
    {
      id: "name",
      header: t("customer.firstName"),
      cell: (customer) => `${customer.firstName} ${customer.lastName}`,
      mobileRole: "primary",
    },
    {
      id: "company",
      header: t("customer.company"),
      cell: (customer) => customer.company ?? "—",
      mobileRole: "secondary",
    },
    {
      id: "email",
      header: t("customer.email"),
      cell: (customer) => customer.email ?? "—",
      mobileRole: "secondary",
    },
    {
      id: "status",
      header: t("customer.status"),
      cell: (customer) =>
        customer.status === "ACTIVE" ? t("customer.statusActive") : t("customer.statusInactive"),
      mobileRole: "secondary",
    },
  ];

  const bulkActions: BulkAction[] = [
    {
      id: "delete",
      label: t("common.bulkActions.delete"),
      variant: "destructive",
      onClick: () => setBulkDeleteOpen(true),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("customer.title")}
        subtitle={t("customer.subtitle")}
        primaryAction={
          <Button asChild>
            <Link href="/app/customers/new">{t("customer.newCustomer")}</Link>
          </Button>
        }
      />

      <FilterBar activeFilters={activeFilters}>
        <SearchInput
          value={table.searchInput}
          onChange={table.setSearchInput}
          placeholder={t("customer.searchPlaceholder")}
          className="max-w-sm flex-1"
        />
        <select
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          value={status}
          onChange={handleStatusChange}
        >
          <option value="">{t("customer.allStatuses")}</option>
          <option value="ACTIVE">{t("customer.statusActive")}</option>
          <option value="INACTIVE">{t("customer.statusInactive")}</option>
        </select>
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.items}
        getRowId={(customer) => customer.id}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyState={<p className="text-muted-foreground text-sm">{t("customer.noCustomers")}</p>}
        rowHref={(customer) => `/app/customers/${customer.id}`}
        selection={{ selectedIds: table.selectedIds, onSelectionChange: table.setSelectedIds }}
        bulkActions={bulkActions}
        rowActions={(customer) => (
          <RowActionsMenu
            actions={[
              {
                id: "delete",
                label: t("customer.delete"),
                destructive: true,
                onClick: () => setDeleteTarget(customer),
              },
            ]}
          />
        )}
      />

      {data && (
        <DataTablePagination
          page={table.page}
          pageSize={table.pageSize}
          total={data.total}
          onPageChange={table.goToPage}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("customer.delete")}
        description={t("customer.deleteConfirm")}
        confirmLabel={t("customer.delete")}
        destructive
        isLoading={deleteCustomer.isPending}
        onConfirm={() => void handleDeleteConfirm()}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => {
          setBulkDeleteOpen(open);
          if (!open) setBulkDeleteError(null);
        }}
        title={t("common.bulkActions.deleteConfirmTitle", { count: table.selectedIds.size })}
        description={bulkDeleteError ?? t("common.bulkActions.deleteConfirmDescription")}
        confirmLabel={t("common.bulkActions.delete")}
        destructive
        isLoading={deleteCustomer.isPending}
        onConfirm={() => void handleBulkDeleteConfirm()}
      />
    </div>
  );
}
