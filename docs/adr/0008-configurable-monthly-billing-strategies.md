# ADR 0008: Configurable Monthly Billing Strategies

**Status:** Accepted
**Date:** 2026-07-30

## Context

The Rentals module's `MONTHLY` billing mode originally treated a partial
month the same way `DAILY`/`WEEKLY` treat a partial period: round it up to
one more whole unit. A prior fix (ahead of this ADR) replaced a flat
30-day-per-month assumption with real calendar-month arithmetic, but kept
that same whole-unit rounding rule — a rental spanning any part of a
month was billed for a full extra month.

This task replaces that with a genuinely configurable, tenant-level
monthly billing model, supporting exactly three strategies
(`CALENDAR_MONTH`, `FIXED_30_DAYS`, `CUSTOM`), and changes the underlying
calculation itself: instead of rounding a partial month up to a whole
extra unit, a period now splits into complete monthly units (billed at
the item's monthly rate) plus a remainder in days (billed at the item's
daily rate). This ADR covers the four decisions with the widest blast
radius: the pricing-engine redesign, the data model (tenant settings +
per-item snapshot), the numbering/scope boundary with the Quotes module,
and the historical-immutability guarantee.

## Decision

### Pricing engine: complete units + a daily-priced remainder, not whole-unit rounding

`computeMonthlyBreakdown` (`apps/api/src/rentals/rental-pricing.util.ts`)
replaces the old "round a partial month up" rule with a strategy-specific
split:

- **`CALENDAR_MONTH`** — the largest `n` such that `plannedStart` plus `n`
  calendar months does not pass `plannedEnd`, plus the exact days left
  over after that anchor (e.g. Jan 15 → Mar 20 = 2 complete months
  (Jan15→Mar15) + 5 remaining days, not 3 whole months). Calendar-month
  arithmetic reuses the existing `addCalendarMonthsUtc` (UTC-only, never
  the host's local timezone; clamps day-of-month to the target month's
  actual length — Jan 31 + 1 month = Feb 28/29, Aug 31 + 1 month = Sep
  30). This is the default for every tenant.
- **`FIXED_30_DAYS`** — total billable days (via the existing
  `durationInDays`, which rounds a same-day span up to 1, never 0) divided
  into complete 30-day units, remainder in days.
- **`CUSTOM`** — same as `FIXED_30_DAYS` but with a tenant-defined unit
  length (`customMonthLengthDays`, 1-365) instead of a hardcoded 30.

Because every strategy can produce a remainder, `MONTHLY` items now
**require both** `monthlyPriceMinor` (for complete units) **and**
`dailyPriceMinor` (for the remainder) — previously only `monthlyPriceMinor`
was required. This is a deliberate, documented validation change; existing
tests and fixtures that created `MONTHLY` items without a daily price were
updated to supply one.

The existing `monthsInRange` function (whole-month rounding) is
**unchanged** and still used as-is by the Quotes module (`QuoteItem` has no
tenant-configurable billing strategy — see ADR 0007), which is explicitly
out of scope for this task. The two functions coexist deliberately rather
than unifying Quotes onto the new strategy model.

### Data model: an optional per-tenant settings row, not a required migration backfill

`RentalBillingSettings` is a new model — one optional row per tenant
(`tenantId` unique), holding `monthlyBillingStrategy` (default
`CALENDAR_MONTH` at the column level) and `customMonthLengthDays`
(nullable, meaningful only for `CUSTOM`). It is deliberately **not** a
required row created via a data migration: `RentalBillingSettingsService
.getEffective()` returns the `CALENDAR_MONTH`/`null` default in code
whenever no row exists, so every tenant — including every one that
existed before this feature shipped — gets correct default behavior
automatically, with zero data migration risk and zero impact on existing
tenant rows. A row is only ever created on the first explicit `PATCH`.

This mirrors the existing "reserved extension point" pattern in this
codebase (e.g. `quotes.manageTemplates` in ADR 0007): a deliberately
minimal, additive schema change rather than extending the core `Tenant`
model, since billing strategy is optional per-module configuration, not
tenant identity.

A new small module (`apps/api/src/rental-billing-settings/`) exposes this
as its own settings resource (`GET`/`PATCH
/tenants/:tenantId/rental-billing-settings`) rather than folding it into
`TenantsService`, consistent with how Assets' own settings
(categories/statuses/custom fields) are each their own module. Two new
permissions, `rental_settings.view`/`rental_settings.manage`, gate it —
`.manage` is OWNER/ADMIN-only (a financial policy decision, mirroring
`asset_categories.manage`'s exclusion of MANAGER), `.view` is granted
more broadly (MANAGER/ACCOUNTANT/VIEWER), matching the read-only
conventions already established for Assets/Rentals/Quotes.

### Historical immutability: freeze the strategy on the `RentalItem` at write time, never re-derive it from live settings

The core risk this task calls out explicitly: changing a tenant's billing
strategy must never silently change an already-created rental's stored
total. This is solved by snapshotting, not by any read-time guard:

- `RentalItem` gains two nullable columns, `monthlyBillingStrategy` and
  `customMonthLengthDays`, populated only for `MONTHLY` items.
- Whenever `RentalsService` prices a `MONTHLY` item — at `POST` (create)
  or at `PATCH` with a full `items` replacement — it reads the tenant's
  _current_ effective settings exactly once and stamps them onto every
  `MONTHLY` item being written.
- An update that does **not** replace `items` (e.g. editing just `notes`
  or `discountMinor`) reuses each existing item's already-frozen
  `monthlyBillingStrategy`/`customMonthLengthDays` unchanged — it never
  re-reads the tenant's settings. This is what makes "an explicit rental
  edit can recalculate using current settings only when intended" true:
  intent is expressed by resubmitting `items`, not by editing unrelated
  fields.
- No separate "breakdown" (complete units / remaining days) is persisted.
  `computeMonthlyBreakdown` is a pure function of `(strategy,
customMonthLengthDays, plannedStart, plannedEnd)` — all of which are
  already persisted (the first two per-item, the dates on the parent
  `Rental`) — so the exact original calculation is always reproducible on
  demand without redundant derived storage.
- Rentals are never recomputed on read (`GET` is a plain row fetch, as
  before); the only write paths that touch `subtotalMinor`/`totalMinor`
  are `create`/`update`, both gated by the rule above.

### Date-boundary convention: reused unchanged

This task inspected and preserved the existing convention rather than
introducing a new one: `plannedEnd` is effectively exclusive except that
any elapsed time greater than zero rounds up to at least 1 billable day
(`durationInDays`), and a rental's `plannedEnd` must be strictly after
`plannedStart` (validated at the API layer, unchanged). The new
`CALENDAR_MONTH` remainder calculation follows the same rule: `Math.ceil`
on the elapsed time after the last complete-month anchor, floored at 0
(not 1, since a remainder of exactly 0 is a legitimate "no partial month"
result, unlike a fresh rental's total duration which the DAILY/WEEKLY
rule guarantees is never 0 in practice).

## Consequences

- Frontend (`apps/web/src/lib/rental-pricing.ts`) mirrors the backend
  calculation exactly (`estimateMonthlyBreakdown`), fetching the tenant's
  current settings via `useRentalBillingSettings` so the wizard's live
  estimate matches what the server will actually store.
- The rental wizard and rental detail page both render a human-readable
  breakdown (e.g. "2 calendar months × €500 + 5 days × €25"), using the
  item's frozen strategy on the detail page (reproducible from stored
  data) and the tenant's current settings on the wizard (a not-yet-created
  rental has no frozen strategy yet).
- `generateRentalNumber`'s existing count-then-check race (documented as a
  known limitation in ADR 0007) remains unfixed; unrelated to this task.
  **Superseded:** fixed in
  [ADR 0009](0009-shared-monthly-pricing-and-atomic-rental-numbering.md).
- The Quotes module's `MONTHLY` pricing is intentionally left on the older
  whole-month-rounding behavior (`monthsInRange`), since tenant-configurable
  billing strategies for Quotes were not part of this task's scope.
  **Superseded:** unified with Rentals' engine in
  [ADR 0009](0009-shared-monthly-pricing-and-atomic-rental-numbering.md).
