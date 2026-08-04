"use client";

import { Button, Card, CardContent, Input } from "@rentos/ui";
import Link from "next/link";
import { useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../../components/shell/page-header";
import { useCurrentTenantId } from "../../../hooks/use-current-tenant";
import { useCustomers, useDeleteCustomer } from "../../../hooks/use-customers";
import type { CustomerStatus } from "../../../types/customer";

const PAGE_SIZE = 20;

export default function CustomersPage() {
  const { t } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CustomerStatus | "">("");

  const { data, isLoading } = useCustomers(tenantId, {
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    status: status || undefined,
  });
  const deleteCustomer = useDeleteCustomer(tenantId);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>): void {
    setSearch(event.target.value);
    setPage(1);
  }

  function handleStatusChange(event: ChangeEvent<HTMLSelectElement>): void {
    setStatus(event.target.value as CustomerStatus | "");
    setPage(1);
  }

  async function handleDelete(id: string): Promise<void> {
    if (window.confirm(t("customer.deleteConfirm"))) {
      await deleteCustomer.mutateAsync(id);
    }
  }

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

      <div className="flex gap-3">
        <Input
          placeholder={t("customer.searchPlaceholder")}
          value={search}
          onChange={handleSearchChange}
          className="max-w-sm"
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
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <p className="text-muted-foreground p-6 text-sm">{t("common.loading")}</p>}
          {!isLoading && data?.items.length === 0 && (
            <p className="text-muted-foreground p-6 text-sm">{t("customer.noCustomers")}</p>
          )}
          {!isLoading && data && data.items.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3 font-medium">{t("customer.firstName")}</th>
                  <th className="p-3 font-medium">{t("customer.lastName")}</th>
                  <th className="p-3 font-medium">{t("customer.company")}</th>
                  <th className="p-3 font-medium">{t("customer.email")}</th>
                  <th className="p-3 font-medium">{t("customer.status")}</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((customer) => (
                  <tr key={customer.id} className="border-b last:border-0">
                    <td className="p-3">{customer.firstName}</td>
                    <td className="p-3">{customer.lastName}</td>
                    <td className="p-3">{customer.company ?? "—"}</td>
                    <td className="p-3">{customer.email ?? "—"}</td>
                    <td className="p-3">
                      {customer.status === "ACTIVE"
                        ? t("customer.statusActive")
                        : t("customer.statusInactive")}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/app/customers/${customer.id}`}>
                            {t("customer.editCustomer")}
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDelete(customer.id)}
                        >
                          {t("customer.delete")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
