"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { DashboardGrid, DashboardMetric } from "../../../../components/dashboard";
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
import { formatMoney } from "../../../../lib/money";
import { estimateMonthlyBreakdown } from "../../../../lib/rental-pricing";
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={rental.rentalNumber}
        subtitle={`${rental.customer.firstName} ${rental.customer.lastName} · ${t(`rental.statuses.${rental.status}`)}`}
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

      <DashboardGrid
        className={rental.status === "ACTIVE" ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-2" : "grid-cols-1"}
      >
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
        {rental.status === "ACTIVE" && (
          <DashboardMetric
            label={t("rental.summary.daysRemaining")}
            value={Math.max(
              0,
              Math.ceil((new Date(rental.plannedEnd).getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
            )}
          />
        )}
      </DashboardGrid>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
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
              <CardTitle>{t("rental.sections.items")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-3 font-medium">{t("asset.fields.name")}</th>
                    <th className="p-3 font-medium">{t("rental.fields.billingMode")}</th>
                    <th className="p-3 font-medium">{t("rental.fields.quantity")}</th>
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
                    return (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="p-3">{item.asset.name}</td>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span>{value}</span>
    </div>
  );
}
