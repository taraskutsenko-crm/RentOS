"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { usePermission } from "../../../../hooks/use-current-tenant-role";
import {
  quotePdfUrl,
  useAcceptQuote,
  useCancelQuote,
  useConvertQuoteToRental,
  useDeleteQuote,
  useDuplicateQuote,
  useQuote,
  useQuoteTimeline,
  useRegenerateQuotePdf,
  useRejectQuote,
  useSendQuote,
} from "../../../../hooks/use-quotes";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";
import { formatMoney } from "../../../../lib/money";
import { estimateMonthlyBreakdown } from "../../../../lib/rental-pricing";

const EDITABLE_STATUSES = new Set(["DRAFT"]);
const DELETABLE_STATUSES = new Set(["DRAFT", "CANCELLED"]);
const SENDABLE_STATUSES = new Set(["DRAFT", "SENT", "VIEWED"]);
const DECIDABLE_STATUSES = new Set(["SENT", "VIEWED"]);
const CANCELLABLE_STATUSES = new Set(["DRAFT", "SENT"]);

export default function QuoteDetailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [tenantId] = useCurrentTenantId();
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: quote, isLoading, isError } = useQuote(tenantId, params.id);
  const { data: timeline } = useQuoteTimeline(tenantId, params.id);
  const deleteQuote = useDeleteQuote(tenantId);
  const sendQuote = useSendQuote(tenantId);
  const acceptQuote = useAcceptQuote(tenantId);
  const rejectQuote = useRejectQuote(tenantId);
  const cancelQuote = useCancelQuote(tenantId);
  const duplicateQuote = useDuplicateQuote(tenantId);
  const convertQuote = useConvertQuoteToRental(tenantId);
  const regeneratePdf = useRegenerateQuotePdf(tenantId);

  const canUpdate = usePermission("quotes.update");
  const canDelete = usePermission("quotes.delete");
  const canSend = usePermission("quotes.send");
  const canAccept = usePermission("quotes.accept");
  const canReject = usePermission("quotes.reject");
  const canConvert = usePermission("quotes.convert");
  const canDuplicate = usePermission("quotes.duplicate");
  const canDownload = usePermission("quotes.download");

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  if (isError || !quote) {
    return <p className="text-destructive text-sm">{t("common.error")}</p>;
  }

  async function runAction(action: () => Promise<unknown>): Promise<void> {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(apiErrorMessage(error, t("common.error")));
    }
  }

  async function handleDelete(): Promise<void> {
    if (!window.confirm(t("quote.deleteConfirm"))) return;
    await runAction(async () => {
      await deleteQuote.mutateAsync(quote!.id);
      router.push("/app/quotes");
    });
  }

  async function handleDuplicate(): Promise<void> {
    await runAction(async () => {
      const duplicated = await duplicateQuote.mutateAsync({ id: quote!.id });
      router.push(`/app/quotes/${duplicated.id}`);
    });
  }

  async function handleConvert(): Promise<void> {
    if (!window.confirm(t("quote.convertConfirm"))) return;
    await runAction(async () => {
      const result = await convertQuote.mutateAsync({ id: quote!.id });
      router.push(`/app/rentals/${result.rental.id}`);
    });
  }

  async function handleReject(): Promise<void> {
    const reason = window.prompt(t("quote.actions.rejectPrompt")) ?? undefined;
    await runAction(() => rejectQuote.mutateAsync({ id: quote!.id, reason }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{quote.quoteNumber}</h1>
          <p className="text-muted-foreground text-sm">
            {quote.customer.firstName} {quote.customer.lastName} ·{" "}
            <span aria-label={t(`quote.statuses.${quote.status}`)}>
              {t(`quote.statuses.${quote.status}`)}
            </span>
            {" · "}
            {t("quote.fields.validUntil")}: {new Date(quote.validUntil).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canUpdate && EDITABLE_STATUSES.has(quote.status) && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/quotes/${quote.id}/edit`}>{t("quote.editQuote")}</Link>
            </Button>
          )}
          {canDownload && (
            <Button asChild variant="outline" size="sm">
              <a href={quotePdfUrl(tenantId, quote.id)} target="_blank" rel="noreferrer">
                {t("quote.actions.viewPdf")}
              </a>
            </Button>
          )}
          {canDownload && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void runAction(() => regeneratePdf.mutateAsync(quote!.id))}
            >
              {t("quote.actions.regeneratePdf")}
            </Button>
          )}
          {canSend && SENDABLE_STATUSES.has(quote.status) && (
            <Button
              size="sm"
              onClick={() => void runAction(() => sendQuote.mutateAsync({ id: quote!.id }))}
            >
              {t("quote.actions.send")}
            </Button>
          )}
          {canAccept && DECIDABLE_STATUSES.has(quote.status) && (
            <Button
              size="sm"
              onClick={() => void runAction(() => acceptQuote.mutateAsync({ id: quote!.id }))}
            >
              {t("quote.actions.accept")}
            </Button>
          )}
          {canReject && DECIDABLE_STATUSES.has(quote.status) && (
            <Button variant="outline" size="sm" onClick={() => void handleReject()}>
              {t("quote.actions.reject")}
            </Button>
          )}
          {canConvert && quote.status === "ACCEPTED" && (
            <Button size="sm" onClick={() => void handleConvert()}>
              {t("quote.actions.convert")}
            </Button>
          )}
          {canDuplicate && (
            <Button variant="outline" size="sm" onClick={() => void handleDuplicate()}>
              {t("quote.actions.duplicate")}
            </Button>
          )}
          {canUpdate && CANCELLABLE_STATUSES.has(quote.status) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void runAction(() => cancelQuote.mutateAsync({ id: quote!.id }))}
            >
              {t("quote.actions.cancel")}
            </Button>
          )}
          {canDelete && DELETABLE_STATUSES.has(quote.status) && (
            <Button size="sm" variant="outline" onClick={() => void handleDelete()}>
              {t("customer.delete")}
            </Button>
          )}
        </div>
      </div>

      {actionError && <p className="text-destructive text-sm">{actionError}</p>}

      {quote.status === "CONVERTED" && quote.convertedRental && (
        <p className="text-sm">
          {t("quote.convertedNotice")}{" "}
          <Link className="underline" href={`/app/rentals/${quote.convertedRental.id}`}>
            {quote.convertedRental.rentalNumber}
          </Link>
        </p>
      )}

      {quote.availabilityWarnings.length > 0 && (
        <div className="border-destructive rounded-md border p-3 text-sm">
          <p className="font-medium">{t("quote.availabilityWarningTitle")}</p>
          {quote.availabilityWarnings.map((warning) => (
            <p key={warning.assetId}>
              {quote.items.find((item) => item.assetId === warning.assetId)?.name ??
                warning.assetId}
              : {t("rental.wizard.unavailable")}
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("rental.sections.details")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow
                label={t("rental.fields.plannedStart")}
                value={new Date(quote.plannedStart).toLocaleString()}
              />
              <InfoRow
                label={t("rental.fields.plannedEnd")}
                value={new Date(quote.plannedEnd).toLocaleString()}
              />
              <InfoRow
                label={t("quote.fields.issueDate")}
                value={new Date(quote.issueDate).toLocaleDateString()}
              />
              <InfoRow
                label={t("quote.fields.validUntil")}
                value={new Date(quote.validUntil).toLocaleString()}
              />
              <InfoRow label={t("quote.fields.customerNotes")} value={quote.customerNotes ?? "—"} />
              <InfoRow
                label={t("rental.fields.internalNotes")}
                value={quote.internalNotes ?? "—"}
              />
              <InfoRow
                label={t("quote.fields.termsAndConditions")}
                value={quote.termsAndConditions ?? "—"}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("rental.sections.items")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-3 font-medium">{t("quote.fields.name")}</th>
                    <th className="p-3 font-medium">{t("quote.fields.itemType")}</th>
                    <th className="p-3 font-medium">{t("rental.fields.billingMode")}</th>
                    <th className="p-3 font-medium">{t("rental.fields.quantity")}</th>
                    <th className="p-3 font-medium">{t("rental.fields.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.items.map((item) => {
                    const breakdown =
                      item.billingMode === "MONTHLY" && item.monthlyBillingStrategy
                        ? estimateMonthlyBreakdown(
                            item.monthlyBillingStrategy,
                            item.customMonthLengthDays,
                            quote.plannedStart,
                            quote.plannedEnd,
                          )
                        : null;
                    return (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="p-3">{item.name}</td>
                        <td className="p-3">{t(`quote.itemTypes.${item.itemType}`)}</td>
                        <td className="p-3">
                          {t(`quote.billingModes.${item.billingMode}`)}
                          {breakdown && (
                            <p className="text-muted-foreground text-xs">
                              {[
                                breakdown.completeUnits > 0 &&
                                  t(
                                    `rental.wizard.monthlyBreakdown.${item.monthlyBillingStrategy}`,
                                    {
                                      count: breakdown.completeUnits,
                                      length: item.customMonthLengthDays ?? "",
                                      price: formatMoney(
                                        item.monthlyPriceMinor ?? 0,
                                        quote.currency,
                                      ),
                                    },
                                  ),
                                breakdown.remainingDays > 0 &&
                                  t("rental.wizard.monthlyBreakdown.days", {
                                    count: breakdown.remainingDays,
                                    price: formatMoney(item.dailyPriceMinor ?? 0, quote.currency),
                                  }),
                              ]
                                .filter(Boolean)
                                .join(" + ")}
                            </p>
                          )}
                        </td>
                        <td className="p-3">{item.quantity}</td>
                        <td className="p-3">{formatMoney(item.lineTotalMinor, quote.currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("rental.sections.financial")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow
                label={t("rental.fields.subtotal")}
                value={formatMoney(quote.subtotalMinor, quote.currency)}
              />
              <InfoRow
                label={t("rental.fields.discount")}
                value={formatMoney(quote.discountTotalMinor, quote.currency)}
              />
              <InfoRow
                label={t("quote.fields.taxTotal")}
                value={formatMoney(quote.taxTotalMinor, quote.currency)}
              />
              <InfoRow
                label={t("quote.fields.depositTotal")}
                value={formatMoney(quote.depositTotalMinor, quote.currency)}
              />
              <InfoRow
                label={t("rental.fields.total")}
                value={formatMoney(quote.totalMinor, quote.currency)}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("asset.sections.timeline")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-3 text-sm">
              {timeline?.map((event) => (
                <li key={event.id} className="border-l-2 pl-3">
                  <p className="font-medium">{t(`quote.timeline.${event.type}`)}</p>
                  <p className="text-muted-foreground text-xs">
                    {new Date(event.occurredAt).toLocaleString()}
                  </p>
                </li>
              ))}
              {(!timeline || timeline.length === 0) && (
                <p className="text-muted-foreground text-sm">{t("asset.noTimelineEvents")}</p>
              )}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span>{value}</span>
    </div>
  );
}
