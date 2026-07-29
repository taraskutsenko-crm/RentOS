"use client";

import { Button, Card, CardContent, Input } from "@rentos/ui";
import Link from "next/link";
import { useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import { useCurrentTenantId } from "../../../hooks/use-current-tenant";
import { usePermission } from "../../../hooks/use-current-tenant-role";
import { useQuotes } from "../../../hooks/use-quotes";
import { formatMoney } from "../../../lib/money";
import type { QuoteStatus } from "../../../types/quote";

const PAGE_SIZE = 20;
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
  const { t } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<QuoteStatus | "">("");

  const canCreate = usePermission("quotes.create");
  const { data, isLoading, isError } = useQuotes(tenantId, {
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    status: status || undefined,
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
          <h1 className="text-2xl font-semibold">{t("quote.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("quote.subtitle")}</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/app/quotes/new">{t("quote.newQuote")}</Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder={t("quote.searchPlaceholder")}
          value={search}
          onChange={handleSearchChange}
          className="max-w-sm"
        />
        <select
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as QuoteStatus | "");
            setPage(1);
          }}
        >
          <option value="">{t("quote.allStatuses")}</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`quote.statuses.${value}`)}
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
            <p className="text-muted-foreground p-6 text-sm">{t("quote.noQuotes")}</p>
          )}
          {!isLoading && data && data.items.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3 font-medium">{t("quote.fields.quoteNumber")}</th>
                  <th className="p-3 font-medium">{t("customer.title")}</th>
                  <th className="p-3 font-medium">{t("quote.fields.status")}</th>
                  <th className="p-3 font-medium">{t("quote.fields.validUntil")}</th>
                  <th className="p-3 font-medium">{t("rental.fields.total")}</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((quote) => (
                  <tr key={quote.id} className="border-b last:border-0">
                    <td className="p-3">{quote.quoteNumber}</td>
                    <td className="p-3">
                      {quote.customer.firstName} {quote.customer.lastName}
                    </td>
                    <td className="p-3">{t(`quote.statuses.${quote.status}`)}</td>
                    <td className="p-3">{new Date(quote.validUntil).toLocaleDateString()}</td>
                    <td className="p-3">{formatMoney(quote.totalMinor, quote.currency)}</td>
                    <td className="p-3 text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/app/quotes/${quote.id}`}>{t("asset.view")}</Link>
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
