import type {
  Customer,
  Document,
  MonthlyBillingStrategy,
  PartialMonthPolicy,
  Prisma,
  Quote,
  Rental,
} from "@prisma/client";

export const QUOTE_ITEM_INCLUDE = {
  asset: { include: { category: true, currentStatus: true } },
} satisfies Prisma.QuoteItemInclude;

export type QuoteItemWithAsset = Prisma.QuoteItemGetPayload<{
  include: typeof QUOTE_ITEM_INCLUDE;
}>;

export const QUOTE_PLATFORM_DOCUMENT_SELECT = {
  id: true,
  documentType: true,
  customTypeName: true,
  documentNumber: true,
  status: true,
  title: true,
  createdAt: true,
} satisfies Prisma.DocumentSelect;

export const QUOTE_DETAIL_INCLUDE = {
  customer: true,
  items: { include: QUOTE_ITEM_INCLUDE, orderBy: { sortOrder: "asc" } },
  convertedRental: true,
  platformDocuments: {
    where: { deletedAt: null },
    select: QUOTE_PLATFORM_DOCUMENT_SELECT,
    orderBy: { createdAt: "desc" },
  },
} satisfies Prisma.QuoteInclude;

export type QuotePlatformDocumentView = Pick<
  Document,
  "id" | "documentType" | "customTypeName" | "documentNumber" | "status" | "title" | "createdAt"
>;

export interface QuoteDetailView extends Quote {
  customer: Customer;
  items: QuoteItemWithAsset[];
  convertedRental: Rental | null;
  platformDocuments: QuotePlatformDocumentView[];
}

export interface QuoteListItemView extends Omit<Quote, "publicTokenHash"> {
  customer: Customer;
  itemCount: number;
}

/** Per-asset availability warning surfaced (never blocking) on save/read. */
export interface QuoteAvailabilityWarning {
  assetId: string;
  conflicts: {
    rentalId: string;
    rentalNumber: string;
    plannedStart: string;
    plannedEnd: string;
  }[];
}

export interface QuoteDetailResponse extends Omit<QuoteDetailView, "publicTokenHash"> {
  availabilityWarnings: QuoteAvailabilityWarning[];
}

/**
 * The subset of a Quote (and its items/customer) safe to return from an
 * unauthenticated public endpoint. Deliberately excludes internalNotes,
 * createdByUserId/updatedByUserId, duplicatedFromQuoteId, publicTokenHash,
 * and tenantId — the public link only ever needs to prove and display the
 * commercial offer itself, never internal bookkeeping identifiers (see
 * ADR 0007's public-token security section).
 */
export interface PublicQuoteItemView {
  id: string;
  itemType: QuoteItemWithAsset["itemType"];
  name: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  billingMode: QuoteItemWithAsset["billingMode"];
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

export interface PublicQuoteView {
  id: string;
  quoteNumber: string;
  status: Quote["status"];
  issueDate: Date;
  validUntil: Date;
  plannedStart: Date;
  plannedEnd: Date;
  currency: string;
  subtotalMinor: number;
  discountTotalMinor: number;
  taxTotalMinor: number;
  depositTotalMinor: number;
  totalMinor: number;
  customerNotes: string | null;
  termsAndConditions: string | null;
  acceptedAt: Date | null;
  acceptedBy: string | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  customer: { firstName: string; lastName: string; company: string | null };
  items: PublicQuoteItemView[];
  availabilityWarnings: QuoteAvailabilityWarning[];
}
