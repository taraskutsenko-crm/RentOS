"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { DashboardGrid, DashboardMetric } from "../../../../components/dashboard";
import { QuoteStatusBadge } from "../../../../components/quotes/quote-status-badge";
import { PageHeader } from "../../../../components/shell/page-header";
import { PinButton } from "../../../../components/shell/pin-button";
import { Timeline } from "../../../../components/timeline/timeline";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { usePermission, useTenantTimezone } from "../../../../hooks/use-current-tenant-role";
import { useTrackRecentItem } from "../../../../hooks/use-recent-items";
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
import { formatBusinessDate, formatBusinessDateTime } from "../../../../lib/date-format";
import { formatMoney } from "../../../../lib/money";
import { getQuoteNextAction } from "../../../../lib/quote-next-action";
import { getQuoteValidityIntelligence } from "../../../../lib/quote-validity-intelligence";
import { estimateMonthlyBreakdown } from "../../../../lib/rental-pricing";
import { QUOTE_TIMELINE_REGISTRY } from "../../../../lib/timeline-registries";

const EDITABLE_STATUSES = new Set(["DRAFT"]);
const DELETABLE_STATUSES = new Set(["DRAFT", "CANCELLED"]);
const SENDABLE_STATUSES = new Set(["DRAFT", "SENT", "VIEWED"]);
const DECIDABLE_STATUSES = new Set(["SENT", "VIEWED"]);
const CANCELLABLE_STATUSES = new Set(["DRAFT", "SENT"]);

export default function QuoteDetailPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [tenantId] = useCurrentTenantId();
  const [actionError, setActionError] = useState<string | null>(null);
  // Date.now() cannot be called during render (impure) — a lazy useState
  // initializer is the sanctioned one-time-impure-computation escape hatch.
  const [nowMs] = useState<number>(() => Date.now());

  const { data: quote, isLoading, isError } = useQuote(tenantId, params.id);
  const { data: timeline } = useQuoteTimeline(tenantId, params.id);
  const trackRecentItem = useTrackRecentItem();

  useEffect(() => {
    if (!quote) return;
    trackRecentItem({
      id: `quote:${quote.id}`,
      kind: "entity",
      entityType: "quote",
      label: quote.quoteNumber,
      href: `/app/quotes/${quote.id}`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-runs when the loaded quote changes
  }, [quote?.id]);

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
  const canCreateDocument = usePermission("documents.create");
  const timeZone = useTenantTimezone();

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

  const validity = getQuoteValidityIntelligence(quote.status, quote.validUntil, nowMs);
  const nextAction = getQuoteNextAction(quote);
  const canConvertNow = canConvert && nextAction.kind === "CONVERT_QUOTE";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={quote.quoteNumber}
        subtitle={`${quote.customer.firstName} ${quote.customer.lastName}`}
        contextInfo={
          <div className="flex flex-wrap items-center gap-3">
            <QuoteStatusBadge status={quote.status} />
            <span className="text-muted-foreground">
              {t(`quote.validityIntelligence.${validity.kind}`, { count: validity.days })}
            </span>
            <span className="text-muted-foreground">
              {t("quote.fields.validUntil")}: {formatBusinessDate(quote.validUntil, i18n.language)}
            </span>
          </div>
        }
        primaryAction={
          canConvertNow ? (
            <Button size="sm" onClick={() => void handleConvert()}>
              {t("quote.actions.convert")}
            </Button>
          ) : undefined
        }
        secondaryActions={
          <>
            <PinButton
              entityType="quote"
              entityId={quote.id}
              label={quote.quoteNumber}
              href={`/app/quotes/${quote.id}`}
            />
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
          </>
        }
      />

      {actionError && <p className="text-destructive text-sm">{actionError}</p>}

      <DashboardGrid>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold">
              {formatMoney(quote.totalMinor, quote.currency)}
            </p>
            <p className="text-muted-foreground text-xs">{t("quote.summary.quoteValue")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold">
              {formatMoney(quote.depositTotalMinor, quote.currency)}
            </p>
            <p className="text-muted-foreground text-xs">{t("quote.summary.depositTotal")}</p>
          </CardContent>
        </Card>
        <DashboardMetric label={t("quote.summary.itemsCount")} value={quote.items.length} />
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold">
              {t(`quote.validityIntelligence.${validity.kind}`, { count: validity.days })}
            </p>
            <p className="text-muted-foreground text-xs">{t("quote.summary.validityStatus")}</p>
          </CardContent>
        </Card>
      </DashboardGrid>

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
              <CardTitle>{t("quote.sections.customer")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow
                label={t("customer.firstName")}
                value={
                  <Link
                    href={`/app/customers/${quote.customer.id}`}
                    className="text-primary hover:underline"
                  >
                    {quote.customer.firstName} {quote.customer.lastName}
                  </Link>
                }
              />
              <InfoRow label={t("customer.company")} value={quote.customer.company ?? "—"} />
              <InfoRow label={t("customer.phone")} value={quote.customer.phone ?? "—"} />
              <InfoRow label={t("customer.email")} value={quote.customer.email ?? "—"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("rental.sections.details")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow
                label={t("rental.fields.plannedStart")}
                value={formatBusinessDateTime(quote.plannedStart, i18n.language)}
              />
              <InfoRow
                label={t("rental.fields.plannedEnd")}
                value={formatBusinessDateTime(quote.plannedEnd, i18n.language)}
              />
              <InfoRow
                label={t("quote.fields.issueDate")}
                value={formatBusinessDate(quote.issueDate, i18n.language)}
              />
              <InfoRow
                label={t("quote.fields.validUntil")}
                value={formatBusinessDateTime(quote.validUntil, i18n.language)}
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
                    <th className="p-3 font-medium">{t("rental.fields.discount")}</th>
                    <th className="p-3 font-medium">{t("quote.fields.taxTotal")}</th>
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
                        <td className="p-3">
                          {item.itemType === "ASSET" && item.asset ? (
                            <Link
                              href={`/app/assets/${item.asset.id}`}
                              className="text-primary hover:underline"
                            >
                              {item.name}
                            </Link>
                          ) : (
                            item.name
                          )}
                        </td>
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
                        <td className="p-3">
                          {formatMoney(item.discountTotalMinor, quote.currency)}
                        </td>
                        <td className="p-3">{formatMoney(item.taxTotalMinor, quote.currency)}</td>
                        <td className="p-3">{formatMoney(item.lineTotalMinor, quote.currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("quote.sections.documents")}</CardTitle>
              {canCreateDocument && (
                <Link
                  href={`/app/documents/new?quoteId=${quote.id}&documentType=QUOTE`}
                  className="text-primary text-sm hover:underline"
                >
                  {t("quote.documents.generate")}
                </Link>
              )}
            </CardHeader>
            <CardContent>
              {!quote.convertedRental &&
              !quote.sourceRental &&
              quote.platformDocuments.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("quote.documents.empty")}</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {quote.sourceRental && (
                    <li className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {t("quote.fields.sourceRental")}
                      </span>
                      <Link
                        href={`/app/rentals/${quote.sourceRental.id}`}
                        className="text-primary hover:underline"
                      >
                        {quote.sourceRental.rentalNumber}
                      </Link>
                    </li>
                  )}
                  {quote.convertedRental && (
                    <li className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {t("quote.fields.convertedRental")}
                      </span>
                      <Link
                        href={`/app/rentals/${quote.convertedRental.id}`}
                        className="text-primary hover:underline"
                      >
                        {quote.convertedRental.rentalNumber}
                      </Link>
                    </li>
                  )}
                  {quote.platformDocuments.map((document) => (
                    <li key={document.id} className="flex items-center justify-between">
                      <span>
                        {document.documentType === "CUSTOM" && document.customTypeName
                          ? document.customTypeName
                          : t(`document.types.${document.documentType}`)}
                        {document.title ? ` — ${document.title}` : ""}
                      </span>
                      <Link
                        href={`/app/documents/${document.id}`}
                        className="text-primary hover:underline"
                      >
                        {document.documentNumber}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
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
              {quote.depositTotalMinor > 0 && (
                // Explicit "amount due at start" = quote total + refundable
                // deposit -- kept visually distinct from Total, which stays
                // the taxable value only (see DECISIONS.md D-097/D-098: a
                // refundable deposit is never revenue).
                <InfoRow
                  label={t("rental.fields.amountDue")}
                  value={formatMoney(quote.totalMinor + quote.depositTotalMinor, quote.currency)}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("timeline.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Timeline
              events={timeline}
              registry={QUOTE_TIMELINE_REGISTRY}
              isLoading={!timeline}
              emptyLabel={t("timeline.empty")}
              searchPlaceholder={t("timeline.searchPlaceholder")}
              timeZone={timeZone}
              getHref={(event) =>
                event.type === "converted" && quote.convertedRental
                  ? `/app/rentals/${quote.convertedRental.id}`
                  : undefined
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span>{value}</span>
    </div>
  );
}
