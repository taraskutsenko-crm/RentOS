"use client";

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@rentos/ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { DashboardGrid, DashboardMetric } from "../../../../components/dashboard";
import { InvoiceStatusBadge } from "../../../../components/invoices/invoice-status-badge";
import { RentalDepositSection } from "../../../../components/rentals/rental-deposit-section";
import { RentalStatusBadge } from "../../../../components/rentals/rental-status-badge";
import { usePageBreadcrumbs } from "../../../../components/shell/breadcrumb-context";
import { PageHeader } from "../../../../components/shell/page-header";
import { PinButton } from "../../../../components/shell/pin-button";
import { Timeline } from "../../../../components/timeline/timeline";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { usePermission, useTenantTimezone } from "../../../../hooks/use-current-tenant-role";
import { useInvoices } from "../../../../hooks/use-invoices";
import { useGenerateQuoteFromRental } from "../../../../hooks/use-quotes";
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
import { getAssetDisplayLabel } from "../../../../lib/asset-display-label";
import { getAssetStatusLabel } from "../../../../lib/asset-status-label";
import {
  formatBusinessDate,
  formatBusinessDateTime,
  formatDateTime,
} from "../../../../lib/date-format";
import {
  CHECKLIST_ITEM_DOCUMENT_TYPE,
  getRentalDocumentChecklist,
} from "../../../../lib/document-completeness-intelligence";
import { formatMoney } from "../../../../lib/money";
import {
  estimateItemLineTotalMinor,
  estimateMonthlyBreakdown,
} from "../../../../lib/rental-pricing";
import { getRentalNextAction } from "../../../../lib/rental-next-action";
import { getRentalTimeIntelligence } from "../../../../lib/rental-time-intelligence";
import { RENTAL_TIMELINE_REGISTRY } from "../../../../lib/timeline-registries";

const EDITABLE_STATUSES = new Set(["DRAFT", "QUOTE"]);
const DELETABLE_STATUSES = new Set(["DRAFT", "QUOTE", "CANCELLED"]);
const CANCELLABLE_STATUSES = new Set(["DRAFT", "QUOTE", "RESERVED", "ACTIVE"]);

export default function RentalDetailPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [tenantId] = useCurrentTenantId();
  const [actionError, setActionError] = useState<string | null>(null);
  // Date.now() cannot be called during render (impure) — a lazy useState
  // initializer is the sanctioned one-time-impure-computation escape hatch.
  const [nowMs] = useState<number>(() => Date.now());

  const { data: rental, isLoading, isError } = useRental(tenantId, params.id);
  const { data: timeline } = useRentalTimeline(tenantId, params.id);
  const { data: rentalInvoices } = useInvoices(tenantId, { rentalId: params.id, pageSize: 50 });
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
  const generateQuoteFromRental = useGenerateQuoteFromRental(tenantId);

  const canUpdate = usePermission("rentals.update");
  const canDelete = usePermission("rentals.delete");
  const canReserve = usePermission("rentals.reserve");
  const canStart = usePermission("rentals.start");
  const canReturnAction = usePermission("rentals.return");
  const canCancel = usePermission("rentals.cancel");
  const canCreateDocument = usePermission("documents.create");
  const canCreateQuote = usePermission("quotes.create");
  const canCreateInvoice = usePermission("invoices.create");
  const canManageDeposit = usePermission("rentals.manage_deposit");
  const canManageAvailability = usePermission("assets.manage_availability");
  const timeZone = useTenantTimezone();

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

  // A display-only sum of already-stored per-item deposits -- mirrors the
  // resolver's identical resolveRentalDeposit aggregate used in generated
  // documents (variable-resolver.service.ts) -- never a pricing
  // recalculation. Kept strictly separate from rental.totalMinor: the
  // refundable security deposit is not taxable rental revenue (see
  // DECISIONS.md D-097).
  const depositTotalMinor = rental.items.reduce((sum, item) => sum + item.depositMinor, 0);

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

  async function handleGenerateQuote(): Promise<void> {
    await runAction(async () => {
      const quote = await generateQuoteFromRental.mutateAsync(rental!.id);
      router.push(`/app/quotes/${quote.id}`);
    });
  }

  const timeIntelligence = getRentalTimeIntelligence(
    rental.status,
    rental.plannedStart,
    rental.plannedEnd,
    nowMs,
  );
  const nextAction = getRentalNextAction(rental);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={rental.rentalNumber}
        subtitle={`${rental.customer.firstName} ${rental.customer.lastName}`}
        primaryAction={
          nextAction.kind === "GENERATE_CONTRACT" && canCreateDocument ? (
            <Button asChild size="sm">
              <Link href={`/app/documents/new?rentalId=${rental.id}&documentType=CONTRACT`}>
                {t("rental.nextAction.generateContract")}
              </Link>
            </Button>
          ) : nextAction.kind === "PREPARE_HANDOVER" && canCreateDocument ? (
            <Button asChild size="sm">
              <Link
                href={`/app/documents/new?rentalId=${rental.id}&documentType=HANDOVER_PROTOCOL`}
              >
                {t("rental.nextAction.prepareHandover")}
              </Link>
            </Button>
          ) : nextAction.kind === "RETURN_ASSET" && canReturnAction ? (
            <Button
              size="sm"
              onClick={() => void runAction(() => returnRental.mutateAsync({ id: rental.id }))}
            >
              {t("rental.actions.returnAll")}
            </Button>
          ) : undefined
        }
        contextInfo={
          <div className="flex flex-wrap items-center gap-3">
            <RentalStatusBadge status={rental.status} />
            <span className="text-muted-foreground">
              {t(`rental.timeIntelligence.${timeIntelligence.kind}`, {
                count: timeIntelligence.days,
              })}
            </span>
            <span className="text-muted-foreground">
              {formatBusinessDate(rental.plannedStart, i18n.language)} –{" "}
              {formatBusinessDate(rental.plannedEnd, i18n.language)}
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
            {canReturnAction &&
              rental.status === "ACTIVE" &&
              nextAction.kind !== "RETURN_ASSET" && (
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

      {rental.isOverdue && (
        <Alert variant="warning">
          <AlertDescription>
            <p className="font-medium">{t("rental.overdue.bannerTitle")}</p>
            <p>
              {t("rental.overdue.plannedReturn", {
                date: formatDateTime(rental.plannedEnd, i18n.language, timeZone),
              })}
              {" — "}
              {t("rental.timeIntelligence.overdue", { count: timeIntelligence.days })}
            </p>
          </AlertDescription>
        </Alert>
      )}

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
              {formatMoney(depositTotalMinor, rental.currency)}
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
                    {canManageAvailability && <th className="p-3 font-medium"></th>}
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
                            {getAssetDisplayLabel(item.asset)}
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
                            {getAssetStatusLabel(t, item.asset.currentStatus)}
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
                          {item.returnedAt
                            ? formatDateTime(item.returnedAt, i18n.language, timeZone)
                            : "—"}
                        </td>
                        {canManageAvailability && (
                          <td className="p-3">
                            {item.returnedAt && (
                              <Link
                                href={`/app/assets/${item.asset.id}?scheduleBlock=REPAIR&relatedRentalId=${rental.id}`}
                                className="text-primary text-sm hover:underline"
                              >
                                {t("rental.sendToRepair")}
                              </Link>
                            )}
                          </td>
                        )}
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
                  {getRentalDocumentChecklist({
                    ...rental,
                    generatedQuote: rental.generatedQuote,
                  }).map((item) => {
                    const generateDocumentType = CHECKLIST_ITEM_DOCUMENT_TYPE[item.key];
                    const isGeneratedState =
                      item.state === "generated" ||
                      item.state === "sent" ||
                      item.state === "signed";
                    // A real Quote may be linked either direction — this
                    // Rental was converted from one (sourceQuote), or a
                    // canonical Quote was generated FROM it via "Generate
                    // Commercial Quote" (generatedQuote, see DECISIONS.md
                    // D-106) — both link straight to the Quotes workspace,
                    // never to a generic Document, until an actual QUOTE
                    // Document has also been generated.
                    const linkedQuote = rental.sourceQuote ?? rental.generatedQuote ?? null;

                    const openHref =
                      item.key === "commercialOffer"
                        ? isGeneratedState
                          ? `/app/documents/${item.document!.id}`
                          : linkedQuote
                            ? `/app/quotes/${linkedQuote.id}`
                            : null
                        : isGeneratedState
                          ? `/app/documents/${item.document!.id}`
                          : null;

                    return (
                      <li key={item.key} className="flex items-center justify-between">
                        <span>{t(`rental.documentChecklist.items.${item.key}`)}</span>
                        {openHref ? (
                          <Link href={openHref} className="text-primary text-sm hover:underline">
                            {isGeneratedState
                              ? (item.document?.documentNumber ??
                                t("rental.documentChecklist.open"))
                              : (linkedQuote?.quoteNumber ?? t("rental.documentChecklist.open"))}
                          </Link>
                        ) : item.key === "commercialOffer" &&
                          item.state === "readyToGenerate" &&
                          canCreateQuote ? (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-sm"
                            onClick={() => void handleGenerateQuote()}
                            disabled={generateQuoteFromRental.isPending}
                          >
                            {t("rental.documentChecklist.generateQuote")}
                          </Button>
                        ) : item.state === "readyToGenerate" &&
                          item.key !== "commercialOffer" &&
                          generateDocumentType &&
                          canCreateDocument ? (
                          <Link
                            href={`/app/documents/new?rentalId=${rental.id}&documentType=${generateDocumentType}`}
                            className="text-primary text-sm hover:underline"
                          >
                            {t("rental.documentChecklist.generate")}
                          </Link>
                        ) : (
                          <span
                            className={
                              isGeneratedState
                                ? "text-success"
                                : item.state === "readyToGenerate"
                                  ? "text-warning"
                                  : "text-muted-foreground"
                            }
                          >
                            {t(`rental.documentChecklist.states.${item.state}`)}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          <RentalDepositSection
            tenantId={tenantId}
            rentalId={rental.id}
            requiredAmountMinor={depositTotalMinor}
            currency={rental.currency}
            canManage={canManageDeposit}
          />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("rental.sections.documents")}</CardTitle>
              {canCreateDocument && (
                <Link
                  href={`/app/documents/new?rentalId=${rental.id}`}
                  className="text-primary text-sm hover:underline"
                >
                  {t("rental.documents.generate")}
                </Link>
              )}
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
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("rental.sections.invoices")}</CardTitle>
              <div className="flex items-center gap-3">
                {canCreateInvoice && (
                  <select
                    className="border-input h-8 rounded-md border bg-transparent px-2 text-xs shadow-xs"
                    value=""
                    onChange={(event) => {
                      const description = event.target.value;
                      if (!description) return;
                      const draftInvoice = rentalInvoices?.data.find(
                        (invoice) => invoice.status === "DRAFT",
                      );
                      const suffix = `addChargeDescription=${encodeURIComponent(description)}`;
                      router.push(
                        draftInvoice
                          ? `/app/invoices/${draftInvoice.id}?${suffix}`
                          : `/app/invoices/new?rentalId=${rental.id}&${suffix}`,
                      );
                    }}
                  >
                    <option value="">{t("rental.invoices.addCharge")}</option>
                    <option value={t("rental.invoices.chargeTypes.damage")}>
                      {t("rental.invoices.chargeTypes.damage")}
                    </option>
                    <option value={t("rental.invoices.chargeTypes.missingItem")}>
                      {t("rental.invoices.chargeTypes.missingItem")}
                    </option>
                    <option value={t("rental.invoices.chargeTypes.cleaning")}>
                      {t("rental.invoices.chargeTypes.cleaning")}
                    </option>
                    <option value={t("rental.invoices.chargeTypes.fuel")}>
                      {t("rental.invoices.chargeTypes.fuel")}
                    </option>
                    <option value={t("rental.invoices.chargeTypes.lateReturn")}>
                      {t("rental.invoices.chargeTypes.lateReturn")}
                    </option>
                    <option value={t("rental.invoices.chargeTypes.other")}>
                      {t("rental.invoices.chargeTypes.other")}
                    </option>
                  </select>
                )}
                {canCreateInvoice && (
                  <Link
                    href={`/app/invoices/new?rentalId=${rental.id}`}
                    className="text-primary text-sm hover:underline"
                  >
                    {t("rental.invoices.create")}
                  </Link>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!rentalInvoices || rentalInvoices.data.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("rental.invoices.empty")}</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {rentalInvoices.data.map((invoice) => (
                    <li key={invoice.id} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <InvoiceStatusBadge status={invoice.status} />
                        <span>{formatMoney(invoice.totalMinor, invoice.currency)}</span>
                      </span>
                      <Link
                        href={`/app/invoices/${invoice.id}`}
                        className="text-primary hover:underline"
                      >
                        {invoice.status === "DRAFT"
                          ? t("invoice.draftLabel")
                          : invoice.invoiceNumber}
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
                value={formatBusinessDateTime(rental.plannedStart, i18n.language)}
              />
              <InfoRow
                label={t("rental.fields.plannedEnd")}
                value={formatBusinessDateTime(rental.plannedEnd, i18n.language)}
              />
              <InfoRow
                label={t("rental.fields.actualStart")}
                value={
                  rental.actualStart
                    ? formatDateTime(rental.actualStart, i18n.language, timeZone)
                    : "—"
                }
              />
              <InfoRow
                label={t("rental.fields.actualEnd")}
                value={
                  rental.actualEnd ? formatDateTime(rental.actualEnd, i18n.language, timeZone) : "—"
                }
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
              {depositTotalMinor > 0 && (
                // Explicit "amount due at start" = rental total + refundable
                // deposit -- kept visually distinct from Total, which stays
                // the taxable rental value only (see DECISIONS.md D-097: a
                // refundable deposit is never rental revenue).
                <InfoRow
                  label={t("rental.fields.amountDue")}
                  value={formatMoney(rental.totalMinor + depositTotalMinor, rental.currency)}
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
              registry={RENTAL_TIMELINE_REGISTRY}
              isLoading={!timeline}
              emptyLabel={t("timeline.empty")}
              searchPlaceholder={t("timeline.searchPlaceholder")}
              timeZone={timeZone}
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
