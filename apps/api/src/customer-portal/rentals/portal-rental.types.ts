import type { RentalDetailView, RentalListItemView } from "../../rentals/rental.types";

/**
 * `internalNotes` is staff-only free text (see Rental.internalNotes's
 * schema doc comment) — never sent to a customer. Everything else on a
 * Rental is already customer-relevant (dates, status, totals, items).
 *
 * `tenantTimezone` (detail view only) is the one addition beyond the staff
 * shape: the customer portal has no equivalent of the staff app's
 * `useTenantTimezone()` (no portal session endpoint exposes it), yet the
 * portal must still interpret/display the rental's schedule in the
 * *company's* timezone, not the customer's own browser timezone (see
 * docs/DECISIONS.md D-115 §11) — most concretely, combining an extension
 * request's date-only picker value with the rental's existing time-of-day.
 * Deliberately not the whole Tenant row — just the one field a customer
 * legitimately needs.
 */
export type PortalRentalListItem = Omit<RentalListItemView, "internalNotes">;
export type PortalRentalDetail = Omit<RentalDetailView, "internalNotes"> & {
  tenantTimezone: string;
};

export function toPortalRentalListItem(rental: RentalListItemView): PortalRentalListItem {
  const { internalNotes: _internalNotes, ...rest } = rental;
  return rest;
}

export function toPortalRentalDetail(
  rental: RentalDetailView,
  tenantTimezone: string,
): PortalRentalDetail {
  const { internalNotes: _internalNotes, ...rest } = rental;
  return { ...rest, tenantTimezone };
}
