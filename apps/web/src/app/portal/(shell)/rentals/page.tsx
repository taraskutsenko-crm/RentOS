"use client";

import { Button, Card, CardContent } from "@rentos/ui";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { usePortalRentals } from "../../../../hooks/use-portal-rentals";
import { formatMoney } from "../../../../lib/money";
import type { RentalStatus } from "../../../../types/rental";

const PAGE_SIZE = 20;
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
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<RentalStatus | "">("");

  const { data, isLoading, isError } = usePortalRentals({
    page,
    pageSize: PAGE_SIZE,
    status: status || undefined,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("portal.rentals.title")}</h1>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as RentalStatus | "");
            setPage(1);
          }}
        >
          <option value="">{t("portal.rentals.allStatuses")}</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`portal.rentals.statuses.${value}`)}
            </option>
          ))}
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
            <p className="text-muted-foreground p-6 text-sm">{t("portal.rentals.noRentals")}</p>
          )}
          {!isLoading && data && data.items.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3 font-medium">{t("rental.fields.rentalNumber")}</th>
                  <th className="p-3 font-medium">{t("rental.fields.status")}</th>
                  <th className="p-3 font-medium">{t("rental.fields.plannedStart")}</th>
                  <th className="p-3 font-medium">{t("rental.fields.plannedEnd")}</th>
                  <th className="p-3 font-medium">{t("rental.fields.total")}</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((rental) => (
                  <tr key={rental.id} className="border-b last:border-0">
                    <td className="p-3">{rental.rentalNumber}</td>
                    <td className="p-3">{t(`portal.rentals.statuses.${rental.status}`)}</td>
                    <td className="p-3">{new Date(rental.plannedStart).toLocaleDateString()}</td>
                    <td className="p-3">{new Date(rental.plannedEnd).toLocaleDateString()}</td>
                    <td className="p-3">{formatMoney(rental.totalMinor, rental.currency)}</td>
                    <td className="p-3 text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/portal/rentals/${rental.id}`}>{t("asset.view")}</Link>
                      </Button>
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
