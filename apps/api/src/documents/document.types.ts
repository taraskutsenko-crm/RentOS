import type {
  Customer,
  Document,
  DocumentFile,
  DocumentItem,
  DocumentVersion,
  Prisma,
  RentalItem,
} from "@prisma/client";

export const DOCUMENT_ITEM_INCLUDE = {
  asset: { include: { category: true, currentStatus: true } },
  rentalItem: true,
} satisfies Prisma.DocumentItemInclude;

export type DocumentItemWithRelations = Prisma.DocumentItemGetPayload<{
  include: typeof DOCUMENT_ITEM_INCLUDE;
}>;

export const DOCUMENT_VERSION_INCLUDE = {
  files: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
} satisfies Prisma.DocumentVersionInclude;

export type DocumentVersionWithFiles = Prisma.DocumentVersionGetPayload<{
  include: typeof DOCUMENT_VERSION_INCLUDE;
}>;

/**
 * Never includes createdByUser/updatedByUser/employeeUser as nested
 * objects — only their IDs — mirroring QUOTE_DETAIL_INCLUDE's convention of
 * never exposing a User row (and its passwordHash) through a business
 * entity's response, even indirectly.
 */
export const DOCUMENT_DETAIL_INCLUDE = {
  customer: true,
  rental: true,
  quote: true,
  asset: { include: { category: true, currentStatus: true } },
  items: { include: DOCUMENT_ITEM_INCLUDE, orderBy: { sortOrder: "asc" } },
  versions: { include: DOCUMENT_VERSION_INCLUDE, orderBy: { versionNumber: "desc" } },
} satisfies Prisma.DocumentInclude;

export type DocumentDetailView = Prisma.DocumentGetPayload<{
  include: typeof DOCUMENT_DETAIL_INCLUDE;
}>;

export interface DocumentListItemView extends Document {
  customer: Customer | null;
  itemCount: number;
}

export type { Document, DocumentFile, DocumentItem, DocumentVersion, RentalItem };
