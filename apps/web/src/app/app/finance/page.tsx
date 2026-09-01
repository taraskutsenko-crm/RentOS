"use client";

import { Button, Card, CardContent, CardHeader, CardTitle, Select, cn } from "@rentos/ui";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";

import { DataTable } from "../../../components/data-table/data-table";
import { DataTablePagination } from "../../../components/data-table/data-table-pagination";
import { useDataTableState } from "../../../components/data-table/use-data-table-state";
import { AgingBarChart } from "../../../components/finance/aging-bar-chart";
import { CashSeriesChart } from "../../../components/finance/cash-series-chart";
import { KpiCard } from "../../../components/finance/kpi-card";
import { PeriodSelector } from "../../../components/finance/period-selector";
import { PageHeader } from "../../../components/shell/page-header";
import { useCurrentTenantId } from "../../../hooks/use-current-tenant";
import { usePermission } from "../../../hooks/use-current-tenant-role";
import {
  financeReportExportUrl,
  useFinanceAssets,
  useFinanceBiggestDebtors,
  useFinanceCashReceivedTable,
  useFinanceCategories,
  useFinanceDeposits,
  useFinanceOverview,
  useFinancePayments,
  useFinanceReceivablesAging,
  useFinanceReceivablesTable,
  useFinanceTimeseries,
  useFinanceTopCustomers,
  useFinanceUtilization,
  type PeriodFilter,
} from "../../../hooks/use-finance-reports";
import { formatMoney } from "../../../lib/money";
import type { ReportPeriodPreset, TopCustomersMetric } from "../../../types/finance-reports";

type FinanceTab = "overview" | "revenue" | "receivables" | "payments" | "customers" | "assets";
const TABS: FinanceTab[] = ["overview", "revenue", "receivables", "payments", "customers", "assets"];

export default function FinanceReportsPage() {
  const { t, i18n } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const canExport = usePermission("finance.export");

  const [tab, setTab] = useState<FinanceTab>("overview");
  const [preset, setPreset] = useState<ReportPeriodPreset>("THIS_MONTH");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [chartCurrency, setChartCurrency] = useState<string | null>(null);
  const [topCustomersMetric, setTopCustomersMetric] = useState<TopCustomersMetric>("invoiced");

  const filter: PeriodFilter = useMemo(
    () => ({ period: preset, from: preset === "CUSTOM" ? customFrom || undefined : undefined, to: preset === "CUSTOM" ? customTo || undefined : undefined }),
    [preset, customFrom, customTo],
  );

  const overview = useFinanceOverview(tenantId, filter);
  const currencies = useMemo(() => overview.data?.rows.map((r) => r.currency) ?? [], [overview.data]);
  const activeChartCurrency = chartCurrency ?? currencies[0] ?? null;

  const aging = useFinanceReceivablesAging(tenantId);
  const deposits = useFinanceDeposits(tenantId, filter);
  const timeseries = useFinanceTimeseries(tenantId, filter, tab === "overview" || tab === "revenue" ? activeChartCurrency : null);
  const paymentsBreakdown = useFinancePayments(tenantId, filter);
  const biggestDebtors = useFinanceBiggestDebtors(tenantId, undefined, 10);
  const topCustomers = useFinanceTopCustomers(tenantId, filter, topCustomersMetric, undefined, 10);
  const assets = useFinanceAssets(tenantId, filter, undefined, 10);
  const categories = useFinanceCategories(tenantId, filter, undefined, 10);
  const utilization = useFinanceUtilization(tenantId, filter);

  const receivablesTableState = useDataTableState({ initialSortBy: "dueDate", initialSortDirection: "asc" });
  const receivablesTable = useFinanceReceivablesTable(tenantId, {
    page: receivablesTableState.page,
    pageSize: receivablesTableState.pageSize,
    search: receivablesTableState.search || undefined,
    sortBy: receivablesTableState.sort.sortBy ?? "dueDate",
    sortDirection: receivablesTableState.sort.sortDirection,
  });

  const cashTableState = useDataTableState({ initialSortBy: "paymentDate", initialSortDirection: "desc" });
  const cashReceivedTable = useFinanceCashReceivedTable(tenantId, filter, {
    page: cashTableState.page,
    pageSize: cashTableState.pageSize,
    search: cashTableState.search || undefined,
    sortBy: cashTableState.sort.sortBy ?? "paymentDate",
    sortDirection: cashTableState.sort.sortDirection,
  });

  const periodLabel = overview.data
    ? overview.data.period.fromDate
      ? t("finance.period.range", { from: overview.data.period.fromDate, to: overview.data.period.toDate })
      : t("finance.period.ALL_TIME")
    : "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("finance.title")}
        subtitle={t("finance.subtitle")}
        secondaryActions={
          canExport && (
            <div className="flex flex-wrap gap-2">
              <a href={financeReportExportUrl(tenantId, "csv", filter, undefined, "summary")}>
                <Button variant="outline" size="sm">
                  {t("finance.export.csv")}
                </Button>
              </a>
              <a href={financeReportExportUrl(tenantId, "xlsx", filter)}>
                <Button variant="outline" size="sm">
                  {t("finance.export.xlsx")}
                </Button>
              </a>
              <a href={financeReportExportUrl(tenantId, "pdf", filter)} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">
                  {t("finance.export.pdf")}
                </Button>
              </a>
            </div>
          )
        }
      />

      <PeriodSelector
        period={preset}
        from={customFrom}
        to={customTo}
        onChange={(next) => {
          setPreset(next.period);
          setCustomFrom(next.from);
          setCustomTo(next.to);
        }}
      />
      {periodLabel && <p className="text-muted-foreground -mt-3 text-xs">{periodLabel}</p>}

      <div className="border-border flex gap-1 overflow-x-auto border-b" role="tablist">
        {TABS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === value
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t(`finance.tabs.${value}`)}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="flex flex-col gap-6">
          {overview.isLoading ? (
            <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
          ) : overview.data && overview.data.rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("finance.empty.noData")}</p>
          ) : (
            overview.data?.rows.map((row) => (
              <Card key={row.currency}>
                <CardHeader>
                  <CardTitle>{row.currency}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <KpiCard label={t("finance.kpi.invoiced")} valueMinor={row.invoiced.currentMinor} currency={row.currency} comparison={row.invoiced} />
                    <KpiCard
                      label={t("finance.kpi.cashReceived")}
                      valueMinor={row.cashReceived.currentMinor}
                      currency={row.currency}
                      comparison={row.cashReceived}
                      tone="positive"
                    />
                    <KpiCard label={t("finance.kpi.outstanding")} valueMinor={row.outstandingMinor} currency={row.currency} />
                    <KpiCard
                      label={t("finance.kpi.overdue")}
                      valueMinor={row.overdueMinor}
                      currency={row.currency}
                      tone={row.overdueMinor > 0 ? "negative" : "neutral"}
                    />
                    <KpiCard label={t("finance.kpi.tax")} valueMinor={row.tax.currentMinor} currency={row.currency} comparison={row.tax} />
                    <KpiCard
                      label={t("finance.kpi.collectionRate")}
                      valueMinor={0}
                      currency={row.currency}
                      displayOverride={row.collectionRatePercent === null ? "—" : `${row.collectionRatePercent}%`}
                    />
                  </div>
                </CardContent>
              </Card>
            ))
          )}

          {currencies.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{t("finance.chart.title")}</CardTitle>
                {currencies.length > 1 && (
                  <Select value={activeChartCurrency ?? ""} onChange={(e) => setChartCurrency(e.target.value)} className="w-32">
                    {currencies.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                )}
              </CardHeader>
              <CardContent>
                {timeseries.data ? (
                  <CashSeriesChart points={timeseries.data.points} currency={activeChartCurrency ?? ""} granularity={timeseries.data.granularity} />
                ) : (
                  <p className="text-muted-foreground py-8 text-center text-sm">{t("finance.chart.selectCurrency")}</p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t("finance.deposits.title")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-muted-foreground text-xs">{t("finance.deposits.notRevenue")}</p>
              {deposits.data && deposits.data.rows.length > 0 ? (
                deposits.data.rows.map((row) => (
                  <div key={row.currency} className="grid grid-cols-2 gap-3 rounded-md border p-3 sm:grid-cols-6">
                    <div>
                      <p className="text-muted-foreground text-xs">{row.currency}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">{t("finance.deposits.received")}</p>
                      <p className="text-sm font-medium">{formatMoney(row.receivedMinor, row.currency, i18n.language)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">{t("finance.deposits.applied")}</p>
                      <p className="text-sm font-medium">{formatMoney(row.appliedMinor, row.currency, i18n.language)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">{t("finance.deposits.returned")}</p>
                      <p className="text-sm font-medium">{formatMoney(row.returnedMinor, row.currency, i18n.language)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">{t("finance.deposits.retained")}</p>
                      <p className="text-sm font-medium">{formatMoney(row.retainedMinor, row.currency, i18n.language)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">{t("finance.deposits.currentlyHeld")}</p>
                      <p className="text-sm font-semibold">{formatMoney(row.currentlyHeldMinor, row.currency, i18n.language)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">{t("finance.empty.noData")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "revenue" && (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("finance.chart.title")}</CardTitle>
              {currencies.length > 1 && (
                <Select value={activeChartCurrency ?? ""} onChange={(e) => setChartCurrency(e.target.value)} className="w-32">
                  {currencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              )}
            </CardHeader>
            <CardContent>
              {timeseries.data ? (
                <CashSeriesChart points={timeseries.data.points} currency={activeChartCurrency ?? ""} granularity={timeseries.data.granularity} />
              ) : (
                <p className="text-muted-foreground py-8 text-center text-sm">{t("finance.chart.selectCurrency")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle title={t("finance.kpi.collectionRateTooltip")}>{t("finance.kpi.collectionRate")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              {overview.data?.rows.map((row) => (
                <div key={row.currency} className="rounded-md border p-3">
                  <p className="text-muted-foreground text-xs">{row.currency}</p>
                  <p className="text-xl font-semibold">
                    {row.collectionRatePercent === null ? "—" : `${row.collectionRatePercent}%`}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "receivables" && (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("finance.aging.title")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {aging.data && aging.data.rows.length > 0 ? (
                aging.data.rows.map((row) => (
                  <div key={row.currency}>
                    <p className="mb-2 text-sm font-medium">{row.currency}</p>
                    <AgingBarChart row={row} />
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">{t("finance.empty.noData")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("finance.debtors.title")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-3 font-medium">{t("finance.debtors.customer")}</th>
                    <th className="p-3 text-right font-medium">{t("finance.debtors.outstanding")}</th>
                    <th className="p-3 text-right font-medium">{t("finance.debtors.overdue")}</th>
                    <th className="p-3 text-right font-medium">{t("finance.debtors.oldestOverdueDays")}</th>
                    <th className="p-3 text-right font-medium">{t("finance.debtors.unpaidInvoices")}</th>
                  </tr>
                </thead>
                <tbody>
                  {biggestDebtors.data?.rows.map((debtor) => (
                    <tr key={`${debtor.customerId}-${debtor.currency}`} className="border-b last:border-0">
                      <td className="p-3">
                        <Link href={`/app/customers/${debtor.customerId}`} className="hover:underline">
                          {debtor.customerName}
                        </Link>
                      </td>
                      <td className="p-3 text-right">{formatMoney(debtor.outstandingMinor, debtor.currency, i18n.language)}</td>
                      <td className="p-3 text-right">{formatMoney(debtor.overdueMinor, debtor.currency, i18n.language)}</td>
                      <td className="p-3 text-right">{t("finance.debtors.overdueDaysValue", { count: debtor.oldestOverdueDays })}</td>
                      <td className="p-3 text-right">{debtor.unpaidInvoiceCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {biggestDebtors.data?.rows.length === 0 && (
                <p className="text-muted-foreground p-6 text-sm">{t("finance.empty.noData")}</p>
              )}
            </CardContent>
          </Card>

          <div>
            <h2 className="mb-3 text-sm font-semibold">{t("finance.receivablesTable.title")}</h2>
            <DataTable
              columns={[
                {
                  id: "invoiceNumber",
                  header: t("finance.receivablesTable.invoice"),
                  cell: (row) => (
                    <Link href={`/app/invoices/${row.invoiceId}`} className="hover:underline">
                      {row.invoiceNumber}
                    </Link>
                  ),
                  sortable: true,
                },
                { id: "customer", header: t("finance.receivablesTable.customer"), cell: (row) => row.customerName },
                {
                  id: "dueDate",
                  header: t("finance.receivablesTable.dueDate"),
                  cell: (row) => (row.dueDate ? row.dueDate.slice(0, 10) : "—"),
                  sortable: true,
                },
                {
                  id: "totalMinor",
                  header: t("finance.receivablesTable.total"),
                  cell: (row) => formatMoney(row.totalMinor, row.currency, i18n.language),
                  align: "right",
                  sortable: true,
                },
                {
                  id: "outstandingMinor",
                  header: t("finance.receivablesTable.outstanding"),
                  cell: (row) => formatMoney(row.outstandingMinor, row.currency, i18n.language),
                  align: "right",
                  sortable: true,
                },
                { id: "status", header: t("finance.receivablesTable.status"), cell: (row) => row.paymentStatus },
              ]}
              data={receivablesTable.data?.items}
              getRowId={(row) => row.invoiceId}
              isLoading={receivablesTable.isLoading}
              isError={receivablesTable.isError}
              sort={receivablesTableState.sort}
              onSortChange={receivablesTableState.setSort}
              emptyState={<p className="text-muted-foreground text-sm">{t("finance.receivablesTable.empty")}</p>}
            />
            <DataTablePagination
              page={receivablesTableState.page}
              pageSize={receivablesTableState.pageSize}
              total={receivablesTable.data?.total ?? 0}
              onPageChange={receivablesTableState.goToPage}
            />
          </div>
        </div>
      )}

      {tab === "payments" && (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("finance.paymentMethods.title")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {paymentsBreakdown.data && paymentsBreakdown.data.rows.length > 0 ? (
                paymentsBreakdown.data.rows.map((row) => (
                  <div key={row.currency} className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <span className="font-medium">{row.currency}</span>
                      <span className="text-muted-foreground">
                        {t("finance.paymentMethods.totalReceived")}: {formatMoney(row.totalMinor, row.currency, i18n.language)}
                      </span>
                      <span className="text-muted-foreground">
                        {t("finance.paymentMethods.paymentCount")}: {row.count}
                      </span>
                      <span className="text-muted-foreground">
                        {t("finance.paymentMethods.average")}: {formatMoney(row.averageMinor, row.currency, i18n.language)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {row.byMethod.map((method) => {
                        const pct = row.totalMinor > 0 ? Math.round((method.amountMinor / row.totalMinor) * 100) : 0;
                        return (
                          <div key={method.method} className="flex items-center gap-3 text-sm">
                            <span className="w-32 shrink-0 text-xs">
                              {t(`finance.paymentMethods.${method.method}`, t("finance.paymentMethods.OTHER"))}
                            </span>
                            <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                              <div className="bg-primary h-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-32 shrink-0 text-right text-xs tabular-nums">
                              {formatMoney(method.amountMinor, row.currency, i18n.language)} ({pct}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-muted-foreground flex gap-4 text-xs">
                      <span>
                        {t("finance.paymentMethods.manual")}: {formatMoney(row.bySource.manual.amountMinor, row.currency, i18n.language)}
                      </span>
                      <span>
                        {t("finance.paymentMethods.depositApplication")}:{" "}
                        {formatMoney(row.bySource.depositApplication.amountMinor, row.currency, i18n.language)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">{t("finance.empty.noData")}</p>
              )}
            </CardContent>
          </Card>

          <div>
            <h2 className="mb-3 text-sm font-semibold">{t("finance.cashReceivedTable.title")}</h2>
            <DataTable
              columns={[
                { id: "paymentDate", header: t("finance.cashReceivedTable.paymentDate"), cell: (row) => row.paymentDate.slice(0, 10), sortable: true },
                { id: "customer", header: t("finance.cashReceivedTable.customer"), cell: (row) => row.customerName },
                {
                  id: "invoice",
                  header: t("finance.cashReceivedTable.invoice"),
                  cell: (row) => (
                    <Link href={`/app/invoices/${row.invoiceId}`} className="hover:underline">
                      {row.invoiceNumber}
                    </Link>
                  ),
                },
                {
                  id: "amountMinor",
                  header: t("finance.cashReceivedTable.amount"),
                  cell: (row) => formatMoney(row.amountMinor, row.currency, i18n.language),
                  align: "right",
                  sortable: true,
                },
                { id: "method", header: t("finance.cashReceivedTable.method"), cell: (row) => t(`finance.paymentMethods.${row.method}`, t("finance.paymentMethods.OTHER")) },
                {
                  id: "source",
                  header: t("finance.cashReceivedTable.source"),
                  cell: (row) =>
                    row.source === "manual"
                      ? t("finance.cashReceivedTable.sourceManual")
                      : t("finance.cashReceivedTable.sourceDepositApplication"),
                },
                { id: "enteredBy", header: t("finance.cashReceivedTable.enteredBy"), cell: (row) => row.enteredByName },
              ]}
              data={cashReceivedTable.data?.items}
              getRowId={(row) => row.paymentId}
              isLoading={cashReceivedTable.isLoading}
              isError={cashReceivedTable.isError}
              sort={cashTableState.sort}
              onSortChange={cashTableState.setSort}
              emptyState={<p className="text-muted-foreground text-sm">{t("finance.cashReceivedTable.empty")}</p>}
            />
            <DataTablePagination
              page={cashTableState.page}
              pageSize={cashTableState.pageSize}
              total={cashReceivedTable.data?.total ?? 0}
              onPageChange={cashTableState.goToPage}
            />
          </div>
        </div>
      )}

      {tab === "customers" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("finance.topCustomers.title")}</CardTitle>
            <Select
              value={topCustomersMetric}
              onChange={(e) => setTopCustomersMetric(e.target.value as TopCustomersMetric)}
              className="w-40"
            >
              <option value="invoiced">{t("finance.topCustomers.invoiced")}</option>
              <option value="cashReceived">{t("finance.topCustomers.cashReceived")}</option>
              <option value="outstanding">{t("finance.topCustomers.outstanding")}</option>
            </Select>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3 font-medium">{t("finance.topCustomers.title")}</th>
                  <th className="p-3 text-right font-medium">{t("finance.topCustomers.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.data?.rows.map((row) => (
                  <tr key={`${row.customerId}-${row.currency}`} className="border-b last:border-0">
                    <td className="p-3">
                      <Link href={`/app/customers/${row.customerId}`} className="hover:underline">
                        {row.customerName}
                      </Link>
                    </td>
                    <td className="p-3 text-right">{formatMoney(row.amountMinor, row.currency, i18n.language)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {topCustomers.data?.rows.length === 0 && <p className="text-muted-foreground p-6 text-sm">{t("finance.empty.noData")}</p>}
          </CardContent>
        </Card>
      )}

      {tab === "assets" && (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("finance.assets.title")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-3 font-medium">{t("finance.assets.asset")}</th>
                    <th className="p-3 text-right font-medium">{t("finance.assets.invoiced")}</th>
                    <th className="p-3 text-right font-medium">{t("finance.assets.rentalDays")}</th>
                    <th className="p-3 text-right font-medium">{t("finance.assets.rentalCount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.data?.rows.map((row) => (
                    <tr key={`${row.assetId}-${row.currency}`} className="border-b last:border-0">
                      <td className="p-3">
                        <Link href={`/app/assets/${row.assetId}`} className="hover:underline">
                          {row.assetName}
                        </Link>
                      </td>
                      <td className="p-3 text-right">{formatMoney(row.invoicedMinor, row.currency, i18n.language)}</td>
                      <td className="p-3 text-right">{row.rentalDays}</td>
                      <td className="p-3 text-right">{row.rentalCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {assets.data?.rows.length === 0 && (
                <p className="text-muted-foreground p-6 text-sm">{t("finance.empty.noAssetAttribution")}</p>
              )}
              <p className="text-muted-foreground p-3 text-xs">{t("finance.assets.attributionNote")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("finance.categories.title")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-3 font-medium">{t("finance.categories.category")}</th>
                    <th className="p-3 text-right font-medium">{t("finance.assets.invoiced")}</th>
                    <th className="p-3 text-right font-medium">{t("finance.assets.rentalDays")}</th>
                    <th className="p-3 text-right font-medium">{t("finance.assets.rentalCount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.data?.rows.map((row) => (
                    <tr key={`${row.categoryId}-${row.currency}`} className="border-b last:border-0">
                      <td className="p-3">{row.categoryName}</td>
                      <td className="p-3 text-right">{formatMoney(row.invoicedMinor, row.currency, i18n.language)}</td>
                      <td className="p-3 text-right">{row.rentalDays}</td>
                      <td className="p-3 text-right">{row.rentalCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {categories.data?.rows.length === 0 && (
                <p className="text-muted-foreground p-6 text-sm">{t("finance.empty.noAssetAttribution")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("finance.utilization.title")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-muted-foreground text-xs">{t("finance.utilization.note")}</p>
              {utilization.data && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">{t("finance.utilization.rentalUtilization")}</p>
                    <p className="text-xl font-semibold">{utilization.data.fleet.rentalUtilizationPercent}%</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">{t("finance.utilization.rentedDays")}</p>
                    <p className="text-xl font-semibold">{utilization.data.fleet.rentedDays}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">{t("finance.utilization.blockedDays")}</p>
                    <p className="text-xl font-semibold">{utilization.data.fleet.blockedDays}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">{t("finance.utilization.idleDays")}</p>
                    <p className="text-xl font-semibold">{utilization.data.fleet.idleDays}</p>
                  </div>
                </div>
              )}
              {utilization.data && utilization.data.topIdleAssets.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium">{t("finance.utilization.topIdle")}</p>
                  <table className="w-full text-sm">
                    <tbody>
                      {utilization.data.topIdleAssets.map((row) => (
                        <tr key={row.assetId} className="border-b last:border-0">
                          <td className="p-2">{row.assetName}</td>
                          <td className="p-2 text-right">{row.idleDays} {t("finance.utilization.idleDays").toLowerCase()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
