"use client";

import { Button, Card, CardContent, Input } from "@rentos/ui";
import Link from "next/link";
import { useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import { useAssetCategories } from "../../../hooks/use-asset-categories";
import { useAssetStatuses } from "../../../hooks/use-asset-statuses";
import { useAssets } from "../../../hooks/use-assets";
import { usePermission } from "../../../hooks/use-current-tenant-role";
import { useCurrentTenantId } from "../../../hooks/use-current-tenant";

const PAGE_SIZE = 20;

export default function AssetsPage() {
  const { t } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const canCreate = usePermission("assets.create");
  const { data: categories } = useAssetCategories(tenantId);
  const { data: statuses } = useAssetStatuses(tenantId);
  const { data, isLoading, isError } = useAssets(tenantId, {
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    categoryId: categoryId || undefined,
    statusId: statusId || undefined,
    sortBy,
    sortDirection,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>): void {
    setSearch(event.target.value);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("asset.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("asset.subtitle")}</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/app/assets/new">{t("asset.newAsset")}</Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder={t("asset.searchPlaceholder")}
          value={search}
          onChange={handleSearchChange}
          className="max-w-sm"
        />
        <select
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            setPage(1);
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
            setPage(1);
          }}
        >
          <option value="">{t("asset.allStatuses")}</option>
          {statuses?.map((status) => (
            <option key={status.id} value={status.id}>
              {status.name}
            </option>
          ))}
        </select>
        <select
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          value={`${sortBy}:${sortDirection}`}
          onChange={(event) => {
            const [field, direction] = event.target.value.split(":");
            setSortBy(field ?? "createdAt");
            setSortDirection((direction as "asc" | "desc") ?? "desc");
          }}
        >
          <option value="createdAt:desc">{t("asset.sort.newest")}</option>
          <option value="createdAt:asc">{t("asset.sort.oldest")}</option>
          <option value="name:asc">{t("asset.sort.nameAsc")}</option>
          <option value="name:desc">{t("asset.sort.nameDesc")}</option>
        </select>
      </div>

      {isError && <p className="text-destructive text-sm">{t("common.error")}</p>}

      <Card>
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex flex-col gap-2 p-6">
              {[0, 1, 2].map((row) => (
                <div key={row} className="bg-muted h-10 animate-pulse rounded-md" />
              ))}
            </div>
          )}
          {!isLoading && data?.items.length === 0 && (
            <p className="text-muted-foreground p-6 text-sm">{t("asset.noAssets")}</p>
          )}
          {!isLoading && data && data.items.length > 0 && (
            <>
              {/* Desktop table */}
              <table className="hidden w-full text-sm sm:table">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-3 font-medium" />
                    <th className="p-3 font-medium">{t("asset.fields.internalNumber")}</th>
                    <th className="p-3 font-medium">{t("asset.fields.name")}</th>
                    <th className="p-3 font-medium">{t("asset.fields.category")}</th>
                    <th className="p-3 font-medium">{t("asset.fields.status")}</th>
                    <th className="p-3 font-medium">{t("asset.fields.isRentable")}</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((asset) => (
                    <tr key={asset.id} className="border-b last:border-0">
                      <td className="p-3">
                        {asset.primaryImage ? (
                          <img
                            src={`${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/assets/${asset.id}/images/${asset.primaryImage.id}/file`}
                            alt=""
                            className="h-10 w-10 rounded object-cover"
                          />
                        ) : (
                          <div className="bg-muted h-10 w-10 rounded" />
                        )}
                      </td>
                      <td className="p-3">{asset.internalNumber}</td>
                      <td className="p-3">{asset.name}</td>
                      <td className="p-3">{asset.category.name}</td>
                      <td className="p-3">{asset.currentStatus.name}</td>
                      <td className="p-3">
                        {asset.isRentable ? t("asset.rentableYes") : t("asset.rentableNo")}
                      </td>
                      <td className="p-3 text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/app/assets/${asset.id}`}>{t("asset.view")}</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile cards */}
              <div className="flex flex-col gap-3 p-3 sm:hidden">
                {data.items.map((asset) => (
                  <Link
                    key={asset.id}
                    href={`/app/assets/${asset.id}`}
                    className="flex items-center gap-3 rounded-md border p-3"
                  >
                    {asset.primaryImage ? (
                      <img
                        src={`${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/assets/${asset.id}/images/${asset.primaryImage.id}/file`}
                        alt=""
                        className="h-12 w-12 rounded object-cover"
                      />
                    ) : (
                      <div className="bg-muted h-12 w-12 rounded" />
                    )}
                    <div className="flex flex-col">
                      <span className="font-medium">{asset.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {asset.internalNumber} · {asset.category.name} · {asset.currentStatus.name}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            {t("customer.previous")}
          </Button>
          <span className="text-muted-foreground text-sm">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            {t("customer.next")}
          </Button>
        </div>
      )}
    </div>
  );
}
