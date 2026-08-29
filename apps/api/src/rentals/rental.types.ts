import type { Customer, Document, Prisma, Quote, Rental } from "@prisma/client";

export const RENTAL_ITEM_INCLUDE = {
  asset: { include: { category: true, currentStatus: true } },
} satisfies Prisma.RentalItemInclude;

export type RentalItemWithAsset = Prisma.RentalItemGetPayload<{
  include: typeof RENTAL_ITEM_INCLUDE;
}>;

export const RENTAL_SOURCE_QUOTE_SELECT = {
  id: true,
  quoteNumber: true,
} satisfies Prisma.QuoteSelect;

export const RENTAL_DOCUMENT_SELECT = {
  id: true,
  documentType: true,
  customTypeName: true,
  documentNumber: true,
  status: true,
  title: true,
  createdAt: true,
} satisfies Prisma.DocumentSelect;

export const RENTAL_DETAIL_INCLUDE = {
  customer: true,
  items: { include: RENTAL_ITEM_INCLUDE },
  sourceQuote: { select: RENTAL_SOURCE_QUOTE_SELECT },
  /// The canonical Quote generated FROM this Rental (see
  /// QuotesService.createFromRental, DECISIONS.md D-106) — the opposite
  /// direction from sourceQuote above.
  generatedQuote: { select: RENTAL_SOURCE_QUOTE_SELECT },
  documents: {
    where: { deletedAt: null },
    select: RENTAL_DOCUMENT_SELECT,
    orderBy: { createdAt: "desc" },
  },
} satisfies Prisma.RentalInclude;

export type RentalSourceQuoteView = Pick<Quote, "id" | "quoteNumber">;

export type RentalDocumentView = Pick<
  Document,
  "id" | "documentType" | "customTypeName" | "documentNumber" | "status" | "title" | "createdAt"
>;

export interface RentalDetailView extends Rental {
  customer: Customer;
  items: RentalItemWithAsset[];
  sourceQuote: RentalSourceQuoteView | null;
  generatedQuote: RentalSourceQuoteView | null;
  documents: RentalDocumentView[];
  /**
   * Derived, never persisted — see rental-overdue.util.ts's
   * deriveOverdueStatus (the single canonical definition, also used by
   * AvailabilityService for the Assets list). True only while the rental
   * is ACTIVE, its plannedEnd has passed, and at least one item has not
   * actually been returned yet.
   */
  isOverdue: boolean;
  /** Always this rental's own plannedEnd — set only when `isOverdue` is true. */
  overdueSince: string | null;
}

export interface RentalListItemView extends Rental {
  customer: Customer;
  itemCount: number;
}
