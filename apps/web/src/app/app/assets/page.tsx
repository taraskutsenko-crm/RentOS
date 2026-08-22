"use client";

import { Button } from "@rentos/ui";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../../components/shell/page-header";
import { getAssetStatusLabel } from "../../../lib/asset-status-label";
import {
  DataTable,
  DataTablePagination,
  FilterBar,
  SearchInput,
  useDataTableState,
  type ActiveFilter,
  type DataTableColumn,
} from "../../../components/data-table";
import { useAssetCategories } from "../../../hooks/use-asset-categories";
import { useAssetStatuses } from "../../../hooks/use-asset-statuses";
import { useAssets } from "../../../hooks/use-assets";
import { usePermission } from "../../../hooks/use-current-tenant-role";
import { useCurrentTenantId } from "../../../hooks/use-current-tenant";
import type { AssetListItem } from "../../../types/asset";

function assetImageUrl(tenantId: string | null, asset: AssetListItem): string | null {
  if (!asset.primaryImage) return null;
  return `${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/assets/${asset.id}/images/${asset.primaryImage.id}/file`;
}

export default function AssetsPage() {
  const { t } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const [categoryId, setCategoryId] = useState("");
  const [statusId, setStatusId] = useState("");

  const canCreate = usePermission("assets.create");
  const { data: categories } = useAssetCategories(tenantId);
  const { data: statuses } = useAssetStatuses(tenantId);

  const table = useDataTableState({ initialSortBy: "createdAt", initialSortDirection: "desc" });
  const { data, isLoading, isError, refetch } = useAssets(tenantId, {
    page: table.page,
    pageSize: table.pageSize,
    search: table.search || undefined,
    categoryId: categoryId || undefined,
    statusId: statusId || undefined,
    sortBy: table.sort.sortBy ?? "createdAt",
    sortDirection: table.sort.sortDirection,
  });

  const activeFilters: ActiveFilter[] = [];
  const selectedCategory = categories?.items.find((category) => category.id === categoryId);
  if (selectedCategory) {
    activeFilters.push({
      id: "category",
      label: selectedCategory.name,
      onRemove: () => {
        setCategoryId("");
        table.resetToFirstPage();
      },
    });
  }
  const selectedStatus = statuses?.find((status) => status.id === statusId);
  if (selectedStatus) {
    activeFilters.push({
      id: "status",
      label: selectedStatus.name,
      onRemove: () => {
        setStatusId("");
        table.resetToFirstPage();
      },
    });
  }

  const columns: DataTableColumn<AssetListItem>[] = [
    {
      id: "asset",
      header: t("asset.fields.name"),
      sortable: true,
      sortKey: "name",
      mobileRole: "primary",
      cell: (asset) => {
        const imageUrl = assetImageUrl(tenantId, asset);
        return (
          <div className="flex items-center gap-3">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="h-10 w-10 rounded object-cover" />
            ) : (
              <div className="bg-muted h-10 w-10 rounded" />
            )}
            <div className="flex flex-col">
              <span className="font-medium">{asset.name}</span>
              <span className="text-muted-foreground text-xs">{asset.internalNumber}</span>
            </div>
          </div>
        );
      },
    },
    {
      id: "category",
      header: t("asset.fields.category"),
      cell: (asset) => asset.category.name,
      mobileRole: "secondary",
    },
    {
      id: "status",
      header: t("asset.fields.status"),
      cell: (asset) => getAssetStatusLabel(t, asset.currentStatus),
      mobileRole: "secondary",
    },
    {
      id: "rentable",
      header: t("asset.fields.isRentable"),
      cell: (asset) => (asset.isRentable ? t("asset.rentableYes") : t("asset.rentableNo")),
      align: "center",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("asset.title")}
        subtitle={t("asset.subtitle")}
        primaryAction={
          canCreate && (
            <Button asChild>
              <Link href="/app/assets/new">{t("asset.newAsset")}</Link>
            </Button>
          )
        }
      />

      <FilterBar activeFilters={activeFilters}>
        <SearchInput
          value={table.searchInput}
          onChange={table.setSearchInput}
          placeholder={t("asset.searchPlaceholder")}
          className="max-w-sm flex-1"
        />
        <select
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            table.resetToFirstPage();
          }}
        >
          <option value="">{t("asset.allCategories")}</option>
          {categories?.items.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          value={statusId}
          onChange={(event) => {
            setStatusId(event.target.value);
            table.resetToFirstPage();
          }}
        >
          <option value="">{t("asset.allStatuses")}</option>
          {statuses?.map((status) => (
            <option key={status.id} value={status.id}>
              {getAssetStatusLabel(t, status)}
            </option>
          ))}
        </select>
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.items}
        getRowId={(asset) => asset.id}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyState={<p className="text-muted-foreground text-sm">{t("asset.noAssets")}</p>}
        rowHref={(asset) => `/app/assets/${asset.id}`}
        sort={table.sort}
        onSortChange={table.setSort}
        renderMobileCard={(asset) => {
          const imageUrl = assetImageUrl(tenantId, asset);
          return (
            <div className="flex items-center gap-3 rounded-md border p-3">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="h-12 w-12 rounded object-cover" />
              ) : (
                <div className="bg-muted h-12 w-12 rounded" />
              )}
              <div className="flex flex-col">
                <span className="font-medium">{asset.name}</span>
                <span className="text-muted-foreground text-xs">
                  {asset.internalNumber} · {asset.category.name} ·{" "}
                  {getAssetStatusLabel(t, asset.currentStatus)}
                </span>
              </div>
            </div>
          );
        }}
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
