"use client";

import { Button, Card, CardContent, Input } from "@rentos/ui";
import Link from "next/link";
import { useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import { useCurrentTenantId } from "../../../hooks/use-current-tenant";
import { usePermission } from "../../../hooks/use-current-tenant-role";
import { useDocuments } from "../../../hooks/use-documents";
import type { DocumentStatus } from "../../../types/document";

const PAGE_SIZE = 20;
const STATUSES: DocumentStatus[] = [
  "DRAFT",
  "READY",
  "SENT",
  "VIEWED",
  "PARTIALLY_SIGNED",
  "SIGNED",
  "REJECTED",
  "VOIDED",
  "ARCHIVED",
];

export default function DocumentsPage() {
  const { t } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<DocumentStatus | "">("");

  const canCreate = usePermission("documents.create");
  const { data, isLoading, isError } = useDocuments(tenantId, {
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
          <h1 className="text-2xl font-semibold">{t("document.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("document.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/app/documents/templates">{t("documentTemplate.title")}</Link>
          </Button>
          {canCreate && (
            <Button asChild>
              <Link href="/app/documents/new">{t("document.newDocument")}</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder={t("document.searchPlaceholder")}
          value={search}
          onChange={handleSearchChange}
          className="max-w-sm"
        />
        <select
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as DocumentStatus | "");
            setPage(1);
          }}
        >
          <option value="">{t("document.allStatuses")}</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`document.statuses.${value}`)}
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
            <p className="text-muted-foreground p-6 text-sm">{t("document.noDocuments")}</p>
          )}
          {!isLoading && data && data.items.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3 font-medium">{t("document.fields.documentNumber")}</th>
                  <th className="p-3 font-medium">{t("document.fields.documentType")}</th>
                  <th className="p-3 font-medium">{t("customer.title")}</th>
                  <th className="p-3 font-medium">{t("document.fields.status")}</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((document) => (
                  <tr key={document.id} className="border-b last:border-0">
                    <td className="p-3">{document.documentNumber}</td>
                    <td className="p-3">
                      {document.documentType === "CUSTOM"
                        ? (document.customTypeName ?? t("document.types.CUSTOM"))
                        : t(`document.types.${document.documentType}`)}
                    </td>
                    <td className="p-3">
                      {document.customer
                        ? `${document.customer.firstName} ${document.customer.lastName}`
                        : "—"}
                    </td>
                    <td className="p-3">{t(`document.statuses.${document.status}`)}</td>
                    <td className="p-3 text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/app/documents/${document.id}`}>{t("asset.view")}</Link>
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
