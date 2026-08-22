import type { Asset } from "./asset";
import type { Customer } from "./customer";
import type { TimelineEvent } from "./timeline";

export type RentalStatus =
  "DRAFT" | "QUOTE" | "RESERVED" | "ACTIVE" | "RETURNED" | "COMPLETED" | "CANCELLED";

export type RentalBillingMode = "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";

/** See docs/adr/0008-configurable-monthly-billing-strategies.md. */
export type MonthlyBillingStrategy = "CALENDAR_MONTH" | "FIXED_30_DAYS" | "CUSTOM";

/** How a MONTHLY item's leftover partial period is charged. See DECISIONS.md D-072. */
export type PartialMonthPolicy = "PRORATE_BY_DAY" | "ROUND_UP_TO_FULL_MONTH";

export interface RentalItem {
  id: string;
  tenantId: string;
  rentalId: string;
  assetId: string;
  quantity: number;
  billingMode: RentalBillingMode;
  dailyPriceMinor: number | null;
  weeklyPriceMinor: number | null;
  monthlyPriceMinor: number | null;
  customPriceMinor: number | null;
  /** Snapshot of the monthly billing settings used when this item was last priced — null unless billingMode is MONTHLY. */
  monthlyBillingStrategy: MonthlyBillingStrategy | null;
  customMonthLengthDays: number | null;
  /** Snapshot of how this item's leftover partial month is charged — null unless billingMode is MONTHLY. */
  partialMonthPolicy: PartialMonthPolicy | null;
  depositMinor: number;
  discountMinor: number;
  notes: string | null;
  returnedAt: string | null;
  createdAt: string;
  updatedAt: string;
  asset: Asset;
}

export interface RentalBillingSettings {
  tenantId: string;
  monthlyBillingStrategy: MonthlyBillingStrategy;
  customMonthLengthDays: number | null;
  /** Tenant-wide default partial-month policy — see PartialMonthPolicy. */
  partialMonthPolicy: PartialMonthPolicy;
  isDefault: boolean;
  updatedAt: string | null;
}

export interface RentalSourceQuote {
  id: string;
  quoteNumber: string;
}

export type RentalDocumentType =
  | "QUOTE"
  | "CONTRACT"
  | "HANDOVER_PROTOCOL"
  | "RETURN_PROTOCOL"
  | "DAMAGE_REPORT"
  | "CONTRACT_AMENDMENT"
  | "CUSTOM";

export type RentalDocumentStatus =
  | "DRAFT"
  | "READY"
  | "SENT"
  | "VIEWED"
  | "PARTIALLY_SIGNED"
  | "SIGNED"
  | "REJECTED"
  | "VOIDED"
  | "ARCHIVED";

export interface RentalDocument {
  id: string;
  documentType: RentalDocumentType;
  customTypeName: string | null;
  documentNumber: string;
  status: RentalDocumentStatus;
  title: string | null;
  createdAt: string;
}

export interface Rental {
  id: string;
  tenantId: string;
  customerId: string;
  rentalNumber: string;
  status: RentalStatus;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  notes: string | null;
  internalNotes: string | null;
  sourceQuoteId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdByUserId: string;
  updatedByUserId: string | null;
  customer: Customer;
  items: RentalItem[];
  sourceQuote: RentalSourceQuote | null;
  documents: RentalDocument[];
}

export interface RentalListItem extends Omit<Rental, "items" | "sourceQuote" | "documents"> {
  itemCount: number;
}

export interface PaginatedRentals {
  items: RentalListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export type RentalTimelineEventType = "created" | "updated" | "status_changed" | "items_returned";

export type RentalTimelineEvent = TimelineEvent<RentalTimelineEventType>;

export interface AvailabilityConflict {
  rentalId: string;
  rentalNumber: string;
  plannedStart: string;
  plannedEnd: string;
}

export interface AssetAvailabilityResult {
  assetId: string;
  isAvailable: boolean;
  conflicts: AvailabilityConflict[];
}
