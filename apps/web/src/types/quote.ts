import type { Asset } from "./asset";
import type { Customer } from "./customer";
import type { DocumentStatus, DocumentType } from "./document";
import type { MonthlyBillingStrategy, PartialMonthPolicy } from "./rental";
import type { TimelineEvent } from "./timeline";

export interface QuotePlatformDocument {
  id: string;
  documentType: DocumentType;
  customTypeName: string | null;
  documentNumber: string;
  status: DocumentStatus;
  title: string | null;
  createdAt: string;
}

export type QuoteStatus =
  "DRAFT" | "SENT" | "VIEWED" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CONVERTED" | "CANCELLED";

export type QuoteItemType =
  "ASSET" | "SERVICE" | "PRODUCT" | "FEE" | "DELIVERY" | "COLLECTION" | "LABOR" | "CUSTOM";

export type QuoteBillingMode = "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM" | "FLAT";

export type QuoteDiscountType = "PERCENTAGE" | "FIXED";

export interface QuoteAvailabilityConflict {
  rentalId: string;
  rentalNumber: string;
  plannedStart: string;
  plannedEnd: string;
}

export interface QuoteAvailabilityWarning {
  assetId: string;
  conflicts: QuoteAvailabilityConflict[];
}

export interface QuoteItem {
  id: string;
  tenantId: string;
  quoteId: string;
  itemType: QuoteItemType;
  assetId: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  billingMode: QuoteBillingMode;
  unitPriceMinor: number | null;
  dailyPriceMinor: number | null;
  weeklyPriceMinor: number | null;
  monthlyPriceMinor: number | null;
  customPriceMinor: number | null;
  /** Snapshot of the monthly billing settings used when this item was last priced — null unless billingMode is MONTHLY, or the item pre-dates this feature. */
  monthlyBillingStrategy: MonthlyBillingStrategy | null;
  customMonthLengthDays: number | null;
  /** Snapshot of how this item's leftover partial month is charged — null unless billingMode is MONTHLY. */
  partialMonthPolicy: PartialMonthPolicy | null;
  discountType: QuoteDiscountType | null;
  discountValue: number;
  discountTotalMinor: number;
  taxRateBp: number;
  taxTotalMinor: number;
  depositMinor: number;
  lineSubtotalMinor: number;
  lineTotalMinor: number;
  sortOrder: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  asset: Asset | null;
}

export interface Quote {
  id: string;
  tenantId: string;
  customerId: string;
  quoteNumber: string;
  status: QuoteStatus;
  issueDate: string;
  validUntil: string;
  plannedStart: string;
  plannedEnd: string;
  currency: string;
  subtotalMinor: number;
  discountType: QuoteDiscountType | null;
  discountValue: number;
  discountTotalMinor: number;
  taxTotalMinor: number;
  depositTotalMinor: number;
  totalMinor: number;
  customerNotes: string | null;
  internalNotes: string | null;
  termsAndConditions: string | null;
  acceptedAt: string | null;
  acceptedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  duplicatedFromQuoteId: string | null;
  publicTokenExpiresAt: string | null;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  customer: Customer;
  items: QuoteItem[];
  convertedRental: { id: string; rentalNumber: string } | null;
  /** Set when this Quote was generated FROM a Rental via "Generate Commercial Quote" — see DECISIONS.md D-106. */
  sourceRental: { id: string; rentalNumber: string } | null;
  platformDocuments: QuotePlatformDocument[];
  availabilityWarnings: QuoteAvailabilityWarning[];
}

export interface QuoteListItem extends Omit<
  Quote,
  "items" | "convertedRental" | "sourceRental" | "platformDocuments" | "availabilityWarnings"
> {
  itemCount: number;
}

export interface PaginatedQuotes {
  items: QuoteListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export type QuoteTimelineEventType =
  | "created"
  | "updated"
  | "status_changed"
  | "sent"
  | "viewed"
  | "accepted"
  | "rejected"
  | "duplicated"
  | "converted"
  | "pdf_generated";

export type QuoteTimelineEvent = TimelineEvent<QuoteTimelineEventType>;

export interface SendQuoteResult {
  quote: Quote;
  emailSent: boolean;
  emailError?: string;
}

/** PENDING/SENT/FAILED/NOT_CONFIGURED — same truthful shape as Document email delivery (see DECISIONS.md production-infrastructure pass). */
export interface QuoteEmailDelivery {
  id: string;
  quoteId: string;
  recipientEmail: string;
  subject: string;
  message: string | null;
  status: "PENDING" | "SENT" | "FAILED" | "NOT_CONFIGURED";
  errorMessage: string | null;
  providerMessageId: string | null;
  createdAt: string;
  sentAt: string | null;
  failedAt: string | null;
}

export interface ConvertQuoteResult {
  rental: {
    id: string;
    rentalNumber: string;
    status: string;
    totalMinor: number;
    currency: string;
  };
  alreadyConverted: boolean;
}

/** The sanitized subset returned by the unauthenticated public endpoints. */
export interface PublicQuoteItem {
  id: string;
  itemType: QuoteItemType;
  name: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  billingMode: QuoteBillingMode;
  unitPriceMinor: number | null;
  dailyPriceMinor: number | null;
  weeklyPriceMinor: number | null;
  monthlyPriceMinor: number | null;
  customPriceMinor: number | null;
  monthlyBillingStrategy: MonthlyBillingStrategy | null;
  customMonthLengthDays: number | null;
  partialMonthPolicy: PartialMonthPolicy | null;
  discountTotalMinor: number;
  taxTotalMinor: number;
  depositMinor: number;
  lineSubtotalMinor: number;
  lineTotalMinor: number;
  sortOrder: number;
}

export interface PublicQuote {
  id: string;
  quoteNumber: string;
  status: QuoteStatus;
  issueDate: string;
  validUntil: string;
  plannedStart: string;
  plannedEnd: string;
  currency: string;
  subtotalMinor: number;
  discountTotalMinor: number;
  taxTotalMinor: number;
  depositTotalMinor: number;
  totalMinor: number;
  customerNotes: string | null;
  termsAndConditions: string | null;
  acceptedAt: string | null;
  acceptedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  customer: { firstName: string; lastName: string; company: string | null };
  items: PublicQuoteItem[];
  availabilityWarnings: QuoteAvailabilityWarning[];
  /** The issuing tenant's IANA timezone — see PublicQuoteView on the API side. */
  tenantTimezone: string;
}
