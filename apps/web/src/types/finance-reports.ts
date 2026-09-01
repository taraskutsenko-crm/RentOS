/**
 * Havelio Financial Reports & Analytics V1 — mirrors
 * apps/api/src/finance-reports's response shapes one-for-one. Every
 * amount is minor units (see money.ts); nothing here is ever summed
 * across currencies (see docs/DECISIONS.md).
 */

export type ReportPeriodPreset =
  | "THIS_MONTH"
  | "PREVIOUS_MONTH"
  | "LAST_30_DAYS"
  | "LAST_2_MONTHS"
  | "LAST_3_MONTHS"
  | "LAST_90_DAYS"
  | "THIS_QUARTER"
  | "PREVIOUS_QUARTER"
  | "THIS_YEAR"
  | "PREVIOUS_YEAR"
  | "ALL_TIME"
  | "CUSTOM";

export interface ResolvedReportPeriod {
  preset: ReportPeriodPreset;
  fromDate: string | null;
  toDate: string;
  previous: ResolvedReportPeriod | null;
}

export interface CurrencyComparisonValue {
  currentMinor: number;
  previousMinor: number;
  absoluteChangeMinor: number | null;
  percentChange: number | null;
  hasPrevious: boolean;
}

export interface OverviewRow {
  currency: string;
  invoiced: CurrencyComparisonValue;
  cashReceived: CurrencyComparisonValue;
  tax: CurrencyComparisonValue;
  outstandingMinor: number;
  overdueMinor: number;
  outstandingMinorPeriodAgo: number | null;
  overdueMinorPeriodAgo: number | null;
  collectionRatePercent: number | null;
}

export type AgingBucket = "NOT_DUE" | "1_7_DAYS" | "8_30_DAYS" | "31_60_DAYS" | "61_90_DAYS" | "90_PLUS_DAYS";

export interface AgingCurrencyRow {
  currency: string;
  buckets: { bucket: AgingBucket; outstandingMinor: number; invoiceCount: number }[];
}

export interface BiggestDebtorRow {
  currency: string;
  customerId: string;
  customerName: string;
  outstandingMinor: number;
  overdueMinor: number;
  oldestDueDate: string | null;
  oldestOverdueDays: number;
  unpaidInvoiceCount: number;
}

export type TopCustomersMetric = "invoiced" | "cashReceived" | "outstanding";

export interface TopCustomerRow {
  currency: string;
  customerId: string;
  customerName: string;
  amountMinor: number;
}

export interface PaymentsBreakdownRow {
  currency: string;
  totalMinor: number;
  count: number;
  averageMinor: number;
  byMethod: { method: string; amountMinor: number; count: number }[];
  bySource: {
    manual: { amountMinor: number; count: number };
    depositApplication: { amountMinor: number; count: number };
  };
}

export interface DepositSummaryRow {
  currency: string;
  receivedMinor: number;
  returnedMinor: number;
  retainedMinor: number;
  appliedMinor: number;
  currentlyHeldMinor: number;
}

export interface AssetPerformanceRow {
  currency: string;
  assetId: string;
  assetName: string;
  internalNumber: string | null;
  invoicedMinor: number;
  rentalDays: number;
  rentalCount: number;
}

export interface CategoryPerformanceRow {
  currency: string;
  categoryId: string;
  categoryName: string;
  invoicedMinor: number;
  rentalDays: number;
  rentalCount: number;
}

export interface AssetUtilization {
  period: ResolvedReportPeriod;
  periodDays: number;
  fleet: {
    usableDays: number;
    rentedDays: number;
    blockedDays: number;
    idleDays: number;
    rentalUtilizationPercent: number;
  };
  topIdleAssets: { assetId: string; assetName: string; internalNumber: string | null; idleDays: number; rentedDays: number }[];
}

export interface CashSeriesPoint {
  date: string;
  invoicedMinor: number;
  cashReceivedMinor: number;
}

export interface CashSeries {
  period: ResolvedReportPeriod;
  granularity: "day" | "month";
  points: CashSeriesPoint[];
}

export interface ReceivablesTableRow {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  currency: string;
  issueDate: string;
  dueDate: string | null;
  totalMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  paymentStatus: string;
  overdueDays: number;
}

export interface CashReceivedTableRow {
  paymentId: string;
  paymentDate: string;
  customerId: string;
  customerName: string;
  invoiceId: string;
  invoiceNumber: string;
  amountMinor: number;
  currency: string;
  method: string;
  source: "manual" | "deposit_application";
  enteredByName: string;
}

export interface PaymentDemandStats {
  demandSent: number;
  demandNotSent: number;
}
