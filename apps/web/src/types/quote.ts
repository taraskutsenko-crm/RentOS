import type { Asset } from "./asset";
import type { Customer } from "./customer";

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
  availabilityWarnings: QuoteAvailabilityWarning[];
}

export interface QuoteListItem extends Omit<
  Quote,
  "items" | "convertedRental" | "availabilityWarnings"
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

export interface QuoteTimelineEvent {
  id: string;
  type: QuoteTimelineEventType;
  occurredAt: string;
  actorUserId: string | null;
  data: Record<string, unknown>;
}

export interface SendQuoteResult {
  quote: Quote;
  emailSent: boolean;
  emailError?: string;
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
}
