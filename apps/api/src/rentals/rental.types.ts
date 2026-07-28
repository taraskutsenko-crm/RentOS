import type { Customer, Prisma, Rental } from "@prisma/client";

export const RENTAL_ITEM_INCLUDE = {
  asset: { include: { category: true, currentStatus: true } },
} satisfies Prisma.RentalItemInclude;

export type RentalItemWithAsset = Prisma.RentalItemGetPayload<{
  include: typeof RENTAL_ITEM_INCLUDE;
}>;

export const RENTAL_DETAIL_INCLUDE = {
  customer: true,
  items: { include: RENTAL_ITEM_INCLUDE },
} satisfies Prisma.RentalInclude;

export interface RentalDetailView extends Rental {
  customer: Customer;
  items: RentalItemWithAsset[];
}

export interface RentalListItemView extends Rental {
  customer: Customer;
  itemCount: number;
}
