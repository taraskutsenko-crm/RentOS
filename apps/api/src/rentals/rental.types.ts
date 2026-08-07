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
  documents: RentalDocumentView[];
}

export interface RentalListItemView extends Rental {
  customer: Customer;
  itemCount: number;
}
