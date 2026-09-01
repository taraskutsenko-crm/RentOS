import type { Customer, Document, Prisma, Quote, Rental } from "@prisma/client";

import type { RentalAttentionCategory } from "./rental-attention.util";

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
  /** Rental Attention System (rental-attention.util.ts) — `null` when the rental needs no attention right now. Superset of `isOverdue`: OVERDUE_RETURN here is exactly `isOverdue: true` above, plus the two "ending soon" categories `isOverdue` never expressed. */
  attention: RentalAttentionCategory | null;
}

export interface RentalListItemView extends Rental {
  customer: Customer;
  itemCount: number;
  /** See RentalDetailView.attention's own doc comment — same canonical classification, computed from the same rental-attention.util.ts. */
  attention: RentalAttentionCategory | null;
  /** Set only when attention is OVERDUE_RETURN — always this rental's own plannedEnd, the exact instant it became overdue. Exposed here too (not just on the detail view) so the Rentals list badge never needs its own "days overdue" duplicate calculation. */
  overdueSince: string | null;
}

/** One preview row in RentalsService.getAttentionSummary's per-category list. */
export interface RentalAttentionSummaryItem {
  rentalId: string;
  rentalNumber: string;
  customerName: string;
  plannedEnd: string;
  /** Whole days overdue — only set on an OVERDUE_RETURN entry, `null` otherwise. */
  overdueDays: number | null;
}
