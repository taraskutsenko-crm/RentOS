import type { RentalDetailView, RentalListItemView } from "../../rentals/rental.types";

/**
 * `internalNotes` is staff-only free text (see Rental.internalNotes's
 * schema doc comment) — never sent to a customer. Everything else on a
 * Rental is already customer-relevant (dates, status, totals, items).
 */
export type PortalRentalListItem = Omit<RentalListItemView, "internalNotes">;
export type PortalRentalDetail = Omit<RentalDetailView, "internalNotes">;

export function toPortalRentalListItem(rental: RentalListItemView): PortalRentalListItem {
  const { internalNotes: _internalNotes, ...rest } = rental;
  return rest;
}

export function toPortalRentalDetail(rental: RentalDetailView): PortalRentalDetail {
  const { internalNotes: _internalNotes, ...rest } = rental;
  return rest;
}
