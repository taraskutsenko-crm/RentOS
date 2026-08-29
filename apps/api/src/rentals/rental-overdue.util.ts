import type { RentalStatus } from "@prisma/client";

export interface OverdueRentalInput {
  status: RentalStatus;
  plannedEnd: Date;
}

export interface OverdueRentalItemInput {
  returnedAt: Date | null;
}

export interface OverdueStatus {
  isOverdue: boolean;
  /** The exact moment the rental became overdue — always the rental's own `plannedEnd`, never a separately stored value. `null` when not overdue. */
  overdueSince: Date | null;
}

/**
 * A rental is overdue when custody actually transferred (`status ===
 * "ACTIVE"` — a RESERVED/DRAFT/QUOTE rental never took custody, so "overdue
 * return" doesn't apply to it), its planned end has passed, and at least
 * one of its items has not yet been actually returned.
 *
 * `RentalItem.returnedAt` is the one canonical "physical return completed"
 * signal in this codebase (set only by `RentalsService.returnRental()`, the
 * real `POST /rentals/:id/return` business action) — a generated Return
 * Protocol Document, at any status (draft/ready/signed), is separate
 * paperwork and never sets it. See docs/adr/0006-rental-lifecycle-and-availability.md.
 *
 * `overdueSince` is deliberately never a separately computed/stored
 * "duration" — it's always just the rental's own `plannedEnd`, the exact
 * instant it became overdue. Callers that need "how long overdue" compute
 * it at render time from this timestamp, so the value never goes stale.
 */
export function deriveOverdueStatus(
  rental: OverdueRentalInput,
  items: OverdueRentalItemInput[],
  now: Date = new Date(),
): OverdueStatus {
  const overdue =
    rental.status === "ACTIVE" && rental.plannedEnd < now && items.some((item) => !item.returnedAt);
  return { isOverdue: overdue, overdueSince: overdue ? rental.plannedEnd : null };
}
