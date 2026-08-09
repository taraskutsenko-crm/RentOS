"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { DashboardGrid, DashboardMetric } from "../../../../components/dashboard";
import { RentalStatusBadge } from "../../../../components/rentals/rental-status-badge";
import { usePageBreadcrumbs } from "../../../../components/shell/breadcrumb-context";
import { PageHeader } from "../../../../components/shell/page-header";
import { PinButton } from "../../../../components/shell/pin-button";
import { Timeline } from "../../../../components/timeline/timeline";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { usePermission } from "../../../../hooks/use-current-tenant-role";
import { useTrackRecentItem } from "../../../../hooks/use-recent-items";
import {
  useCancelRental,
  useDeleteRental,
  useRental,
  useRentalTimeline,
  useReserveRental,
  useReturnRental,
  useStartRental,
} from "../../../../hooks/use-rentals";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";
import { getRentalDocumentChecklist } from "../../../../lib/document-completeness-intelligence";
import { formatMoney } from "../../../../lib/money";
import {
  estimateItemLineTotalMinor,
  estimateMonthlyBreakdown,
} from "../../../../lib/rental-pricing";
import { getRentalTimeIntelligence } from "../../../../lib/rental-time-intelligence";
import { RENTAL_TIMELINE_REGISTRY } from "../../../../lib/timeline-registries";

const EDITABLE_STATUSES = new Set(["DRAFT", "QUOTE"]);
const DELETABLE_STATUSES = new Set(["DRAFT", "QUOTE", "CANCELLED"]);
const CANCELLABLE_STATUSES = new Set(["DRAFT", "QUOTE", "RESERVED", "ACTIVE"]);

export default function RentalDetailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [tenantId] = useCurrentTenantId();
  const [actionError, setActionError] = useState<string | null>(null);
  // Date.now() cannot be called during render (impure) — a lazy useState
  // initializer is the sanctioned one-time-impure-computation escape hatch.
  const [nowMs] = useState<number>(() => Date.now());

  const { data: rental, isLoading, isError } = useRental(tenantId, params.id);
  const { data: timeline } = useRentalTimeline(tenantId, params.id);
  const trackRecentItem = useTrackRecentItem();

  useEffect(() => {
    if (!rental) return;
    trackRecentItem({
      id: `rental:${rental.id}`,
      kind: "entity",
      entityType: "rental",
      label: rental.rentalNumber,
      href: `/app/rentals/${rental.id}`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-runs when the loaded rental changes
  }, [rental?.id]);

  const deleteRental = useDeleteRental(tenantId);
  const reserveRental = useReserveRental(tenantId);
  const startRental = useStartRental(tenantId);
  const returnRental = useReturnRental(tenantId);
  const cancelRental = useCancelRental(tenantId);

  const canUpdate = usePermission("rentals.update");
  const canDelete = usePermission("rentals.delete");
  const canReserve = usePermission("rentals.reserve");
  const canStart = usePermission("rentals.start");
  const canReturnAction = usePermission("rentals.return");
  const canCancel = usePermission("rentals.cancel");

  usePageBreadcrumbs(
    rental
      ? [
          { label: t("app.nav.dashboard"), href: "/app" },
          { label: t("rental.title"), href: "/app/rentals" },
          { label: rental.rentalNumber },
        ]
      : null,
  );

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  if (isError || !rental) {
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
    if (!window.confirm(t("rental.deleteConfirm"))) return;
    await runAction(async () => {
      await deleteRental.mutateAsync(rental!.id);
      router.push("/app/rentals");
    });
  }

  const timeIntelligence = getRentalTimeIntelligence(
    rental.status,
    rental.plannedStart,
    rental.plannedEnd,
    nowMs,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={rental.rentalNumber}
        subtitle={`${rental.customer.firstName} ${rental.customer.lastName}`}
        contextInfo={
          <div className="flex flex-wrap items-center gap-3">
            <RentalStatusBadge status={rental.status} />
            <span className="text-muted-foreground">
              {t(`rental.timeIntelligence.${timeIntelligence.kind}`, {
                count: timeIntelligence.days,
              })}
            </span>
            <span className="text-muted-foreground">
              {new Date(rental.plannedStart).toLocaleDateString()} –{" "}
              {new Date(rental.plannedEnd).toLocaleDateString()}
            </span>
          </div>
        }
        secondaryActions={
          <>
            <PinButton
              entityType="rental"
              entityId={rental.id}
              label={rental.rentalNumber}
              href={`/app/rentals/${rental.id}`}
            />
            {canUpdate && EDITABLE_STATUSES.has(rental.status) && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/app/rentals/${rental.id}/edit`}>{t("rental.editRental")}</Link>
              </Button>
            )}
            {canReserve && EDITABLE_STATUSES.has(rental.status) && (
              <Button
                size="sm"
                onClick={() => void runAction(() => reserveRental.mutateAsync({ id: rental.id }))}
              >
                {t("rental.actions.reserve")}
              </Button>
            )}
            {canStart && rental.status === "RESERVED" && (
              <Button
                size="sm"
                onClick={() => void runAction(() => startRental.mutateAsync({ id: rental.id }))}
              >
                {t("rental.actions.start")}
              </Button>
            )}
            {canReturnAction && rental.status === "ACTIVE" && (
              <Button
                size="sm"
                onClick={() => void runAction(() => returnRental.mutateAsync({ id: rental.id }))}
              >
                {t("rental.actions.returnAll")}
              </Button>
            )}
            {canCancel && CANCELLABLE_STATUSES.has(rental.status) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void runAction(() => cancelRental.mutateAsync({ id: rental.id }))}
              >
                {t("rental.actions.cancel")}
              </Button>
            )}
            {canDelete && DELETABLE_STATUSES.has(rental.status) && (
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
              {formatMoney(rental.totalMinor, rental.currency)}
            </p>
            <p className="text-muted-foreground text-xs">{t("rental.summary.rentalValue")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold">
              {formatMoney(
                rental.items.reduce((sum, item) => sum + item.depositMinor, 0),
                rental.currency,
              )}
            </p>
            <p className="text-muted-foreground text-xs">{t("rental.summary.totalDeposit")}</p>
          </CardContent>
        </Card>
        <DashboardMetric label={t("rental.summary.assetsCount")} value={rental.items.length} />
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold">
              {t(`rental.timeIntelligence.${timeIntelligence.kind}`, {
                count: timeIntelligence.days,
              })}
            </p>
            <p className="text-muted-foreground text-xs">{t("rental.summary.timeStatus")}</p>
          </CardContent>
        </Card>
      </DashboardGrid>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("rental.sections.customer")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow
                label={t("customer.firstName")}
                value={
                  <Link
                    href={`/app/customers/${rental.customer.id}`}
                    className="text-primary hover:underline"
                  >
                    {rental.customer.firstName} {rental.customer.lastName}
                  </Link>
                }
              />
              <InfoRow label={t("customer.company")} value={rental.customer.company ?? "—"} />
              <InfoRow label={t("customer.phone")} value={rental.customer.phone ?? "—"} />
              <InfoRow label={t("customer.email")} value={rental.customer.email ?? "—"} />
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
                    <th className="p-3 font-medium">{t("asset.fields.name")}</th>
                    <th className="p-3 font-medium">{t("asset.fields.status")}</th>
                    <th className="p-3 font-medium">{t("rental.fields.billingMode")}</th>
                    <th className="p-3 font-medium">{t("rental.fields.quantity")}</th>
                    <th className="p-3 font-medium">{t("rental.fields.total")}</th>
                    <th className="p-3 font-medium">{t("rental.fields.returnedAt")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rental.items.map((item) => {
                    const breakdown =
                      item.billingMode === "MONTHLY" && item.monthlyBillingStrategy
                        ? estimateMonthlyBreakdown(
                            item.monthlyBillingStrategy,
                            item.customMonthLengthDays,
                            rental.plannedStart,
                            rental.plannedEnd,
                          )
                        : null;
                    const lineTotalMinor =
                      item.billingMode === "MONTHLY" && item.monthlyBillingStrategy
                        ? estimateItemLineTotalMinor(
                            {
                              billingMode: "MONTHLY",
                              quantity: item.quantity,
                              dailyPriceMinor: item.dailyPriceMinor ?? undefined,
                              monthlyPriceMinor: item.monthlyPriceMinor ?? undefined,
                              discountMinor: item.discountMinor,
                              monthlyBillingStrategy: item.monthlyBillingStrategy,
                              customMonthLengthDays: item.customMonthLengthDays,
                            },
                            rental.plannedStart,
                            rental.plannedEnd,
                          )
                        : estimateItemLineTotalMinor(
                            {
                              billingMode: item.billingMode,
                              quantity: item.quantity,
                              dailyPriceMinor: item.dailyPriceMinor ?? undefined,
                              weeklyPriceMinor: item.weeklyPriceMinor ?? undefined,
                              customPriceMinor: item.customPriceMinor ?? undefined,
                              discountMinor: item.discountMinor,
                            },
                            rental.plannedStart,
                            rental.plannedEnd,
                          );
                    return (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="p-3">
                          <Link
                            href={`/app/assets/${item.asset.id}`}
                            className="text-primary hover:underline"
                          >
                            {item.asset.name}
                          </Link>
                        </td>
                        <td className="p-3">
                          <span
                            className={`rounded px-2 py-0.5 text-xs ${
                              item.asset.currentStatus.isAvailableForRental
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {item.asset.currentStatus.name}
                          </span>
                        </td>
                        <td className="p-3">
                          {t(`rental.billingModes.${item.billingMode}`)}
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
                                        rental.currency,
                                      ),
                                    },
                                  ),
                                breakdown.remainingDays > 0 &&
                                  t("rental.wizard.monthlyBreakdown.days", {
                                    count: breakdown.remainingDays,
                                    price: formatMoney(item.dailyPriceMinor ?? 0, rental.currency),
                                  }),
                              ]
                                .filter(Boolean)
                                .join(" + ")}
                            </p>
                          )}
                        </td>
                        <td className="p-3">{item.quantity}</td>
                        <td className="p-3">{formatMoney(lineTotalMinor, rental.currency)}</td>
                        <td className="p-3">
                          {item.returnedAt ? new Date(item.returnedAt).toLocaleString() : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {rental.status !== "CANCELLED" && (
            <Card>
              <CardHeader>
                <CardTitle>{t("rental.documentChecklist.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2 text-sm">
                  {getRentalDocumentChecklist(rental).map((item) => (
                    <li key={item.key} className="flex items-center justify-between">
                      <span>{t(`rental.documentChecklist.items.${item.key}`)}</span>
                      <span
                        className={
                          item.state === "present"
                            ? "text-success"
                            : item.state === "missing"
                              ? "text-warning"
                              : "text-muted-foreground"
                        }
                      >
                        {t(`rental.documentChecklist.states.${item.state}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t("rental.sections.documents")}</CardTitle>
            </CardHeader>
            <CardContent>
              {!rental.sourceQuote && rental.documents.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("rental.documents.empty")}</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {rental.sourceQuote && (
                    <li className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {t("rental.fields.sourceQuote")}
                      </span>
                      <Link
                        href={`/app/quotes/${rental.sourceQuote.id}`}
                        className="text-primary hover:underline"
                      >
                        {rental.sourceQuote.quoteNumber}
                      </Link>
                    </li>
                  )}
                  {rental.documents.map((document) => (
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
              <CardTitle>{t("rental.sections.details")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow
                label={t("rental.fields.plannedStart")}
                value={new Date(rental.plannedStart).toLocaleString()}
              />
              <InfoRow
                label={t("rental.fields.plannedEnd")}
                value={new Date(rental.plannedEnd).toLocaleString()}
              />
              <InfoRow
                label={t("rental.fields.actualStart")}
                value={rental.actualStart ? new Date(rental.actualStart).toLocaleString() : "—"}
              />
              <InfoRow
                label={t("rental.fields.actualEnd")}
                value={rental.actualEnd ? new Date(rental.actualEnd).toLocaleString() : "—"}
              />
              <InfoRow label={t("customer.notes")} value={rental.notes ?? "—"} />
              <InfoRow
                label={t("rental.fields.internalNotes")}
                value={rental.internalNotes ?? "—"}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("rental.sections.financial")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow
                label={t("rental.fields.subtotal")}
                value={formatMoney(rental.subtotalMinor, rental.currency)}
              />
              <InfoRow
                label={t("rental.fields.discount")}
                value={formatMoney(rental.discountMinor, rental.currency)}
              />
              <InfoRow
                label={t("rental.fields.tax")}
                value={formatMoney(rental.taxMinor, rental.currency)}
              />
              <InfoRow
                label={t("rental.fields.total")}
                value={formatMoney(rental.totalMinor, rental.currency)}
              />
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
              registry={RENTAL_TIMELINE_REGISTRY}
              isLoading={!timeline}
              emptyLabel={t("timeline.empty")}
              searchPlaceholder={t("timeline.searchPlaceholder")}
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
