"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient, type QueryParams } from "../lib/api-client";
import type {
  AgingCurrencyRow,
  AssetPerformanceRow,
  AssetUtilization,
  BiggestDebtorRow,
  CashReceivedTableRow,
  CashSeries,
  CategoryPerformanceRow,
  DepositSummaryRow,
  OverviewRow,
  PaymentDemandStats,
  PaymentsBreakdownRow,
  ReceivablesTableRow,
  ReportPeriodPreset,
  ResolvedReportPeriod,
  TopCustomerRow,
  TopCustomersMetric,
} from "../types/finance-reports";

const BASE_KEY = "finance-reports";

export interface PeriodFilter {
  period: ReportPeriodPreset;
  from?: string | undefined;
  to?: string | undefined;
}

function periodParams(filter: PeriodFilter): QueryParams {
  return { period: filter.period, from: filter.from, to: filter.to };
}

export function useFinanceOverview(tenantId: string | null, filter: PeriodFilter, currency?: string) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "overview", filter, currency],
    queryFn: () =>
      apiClient.get<{ period: ResolvedReportPeriod; rows: OverviewRow[] }>(
        `/tenants/${tenantId}/finance-reports/overview`,
        { ...periodParams(filter), currency },
      ),
    enabled: !!tenantId,
  });
}

export function useFinanceTimeseries(tenantId: string | null, filter: PeriodFilter, currency: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "timeseries", filter, currency],
    queryFn: () =>
      apiClient.get<CashSeries>(`/tenants/${tenantId}/finance-reports/timeseries`, {
        ...periodParams(filter),
        currency: currency ?? undefined,
      }),
    enabled: !!tenantId && !!currency,
  });
}

export function useFinanceReceivablesAging(tenantId: string | null, currency?: string) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "receivables-aging", currency],
    queryFn: () =>
      apiClient.get<{ rows: AgingCurrencyRow[] }>(`/tenants/${tenantId}/finance-reports/receivables-aging`, {
        currency,
      }),
    enabled: !!tenantId,
  });
}

export function useFinanceBiggestDebtors(tenantId: string | null, currency?: string, limit = 10) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "biggest-debtors", currency, limit],
    queryFn: () =>
      apiClient.get<{ rows: BiggestDebtorRow[] }>(`/tenants/${tenantId}/finance-reports/biggest-debtors`, {
        currency,
        limit,
      }),
    enabled: !!tenantId,
  });
}

export function useFinanceTopCustomers(
  tenantId: string | null,
  filter: PeriodFilter,
  metric: TopCustomersMetric,
  currency?: string,
  limit = 10,
) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "top-customers", filter, metric, currency, limit],
    queryFn: () =>
      apiClient.get<{ period: ResolvedReportPeriod; rows: TopCustomerRow[] }>(
        `/tenants/${tenantId}/finance-reports/top-customers`,
        { ...periodParams(filter), metric, currency, limit },
      ),
    enabled: !!tenantId,
  });
}

export function useFinancePayments(tenantId: string | null, filter: PeriodFilter, currency?: string) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "payments", filter, currency],
    queryFn: () =>
      apiClient.get<{ period: ResolvedReportPeriod; rows: PaymentsBreakdownRow[] }>(
        `/tenants/${tenantId}/finance-reports/payments`,
        { ...periodParams(filter), currency },
      ),
    enabled: !!tenantId,
  });
}

export function useFinanceDeposits(tenantId: string | null, filter: PeriodFilter, currency?: string) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "deposits", filter, currency],
    queryFn: () =>
      apiClient.get<{ period: ResolvedReportPeriod; rows: DepositSummaryRow[] }>(
        `/tenants/${tenantId}/finance-reports/deposits`,
        { ...periodParams(filter), currency },
      ),
    enabled: !!tenantId,
  });
}

export function useFinancePaymentDemandStats(tenantId: string | null, currency?: string) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "payment-demands", currency],
    queryFn: () =>
      apiClient.get<PaymentDemandStats>(`/tenants/${tenantId}/finance-reports/payment-demands`, { currency }),
    enabled: !!tenantId,
  });
}

export function useFinanceAssets(tenantId: string | null, filter: PeriodFilter, currency?: string, limit = 10) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "assets", filter, currency, limit],
    queryFn: () =>
      apiClient.get<{ period: ResolvedReportPeriod; rows: AssetPerformanceRow[] }>(
        `/tenants/${tenantId}/finance-reports/assets`,
        { ...periodParams(filter), currency, limit },
      ),
    enabled: !!tenantId,
  });
}

export function useFinanceCategories(tenantId: string | null, filter: PeriodFilter, currency?: string, limit = 10) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "categories", filter, currency, limit],
    queryFn: () =>
      apiClient.get<{ period: ResolvedReportPeriod; rows: CategoryPerformanceRow[] }>(
        `/tenants/${tenantId}/finance-reports/categories`,
        { ...periodParams(filter), currency, limit },
      ),
    enabled: !!tenantId,
  });
}

export function useFinanceUtilization(tenantId: string | null, filter: PeriodFilter) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "utilization", filter],
    queryFn: () =>
      apiClient.get<AssetUtilization>(`/tenants/${tenantId}/finance-reports/utilization`, periodParams(filter)),
    enabled: !!tenantId,
  });
}

export interface ReceivablesTableFilter {
  page: number;
  pageSize: number;
  currency?: string | undefined;
  customerId?: string | undefined;
  search?: string | undefined;
  sortBy?: string | undefined;
  sortDirection?: "asc" | "desc" | undefined;
}

export function useFinanceReceivablesTable(tenantId: string | null, filter: ReceivablesTableFilter) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "receivables-table", filter],
    queryFn: () =>
      apiClient.get<{ items: ReceivablesTableRow[]; total: number }>(
        `/tenants/${tenantId}/finance-reports/receivables`,
        { ...filter },
      ),
    enabled: !!tenantId,
  });
}

export interface CashReceivedTableFilter extends ReceivablesTableFilter {
  method?: string | undefined;
}

export function useFinanceCashReceivedTable(
  tenantId: string | null,
  periodFilter: PeriodFilter,
  filter: CashReceivedTableFilter,
) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "cash-received-table", periodFilter, filter],
    queryFn: () =>
      apiClient.get<{ items: CashReceivedTableRow[]; total: number }>(
        `/tenants/${tenantId}/finance-reports/cash-received`,
        { ...periodParams(periodFilter), ...filter },
      ),
    enabled: !!tenantId,
  });
}

/** Builds an export URL for a plain `<a href>` link — the same "GET with cookie auth, no client-side JS fetch" pattern `invoicePdfUrl` already established. */
export function financeReportExportUrl(
  tenantId: string | null,
  format: "csv" | "xlsx" | "pdf",
  filter: PeriodFilter,
  currency?: string,
  report?: string,
): string {
  const params = new URLSearchParams();
  params.set("period", filter.period);
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  if (currency) params.set("currency", currency);
  if (report) params.set("report", report);
  return `${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/finance-reports/export/${format}?${params.toString()}`;
}
