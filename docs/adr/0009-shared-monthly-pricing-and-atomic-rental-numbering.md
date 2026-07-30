# ADR 0009: Shared Monthly Pricing Between Quotes and Rentals, and Atomic Rental Numbering

**Status:** Accepted
**Date:** 2026-07-30

## Context

This is a pre-TASK-0008 stabilization task, not a new business module. It
resolves two inconsistencies/limitations left open by prior tasks and
explicitly documented as known limitations at the time:

1. Rentals gained tenant-configurable monthly billing strategies
   (`CALENDAR_MONTH`/`FIXED_30_DAYS`/`CUSTOM` — see
   [ADR 0008](0008-configurable-monthly-billing-strategies.md)), but
   Quotes' own `MONTHLY` pricing was left on the older whole-month-
   rounding calculation (`monthsInRange`), since unifying them was
   explicitly out of scope for that task.
2. `generateRentalNumber` used a count-then-check pattern (count existing
   rentals, probe up to 5 candidate numbers, fall back to a
   `Date.now()`-based number on exhausted retries) that could produce
   colliding candidates under concurrent requests — documented as a known
   limitation in [ADR 0007](0007-quotes-and-commercial-offers.md), left
   unfixed there because `QuoteSequence`'s atomic pattern already solved
   the equivalent problem for quote numbers and extending the same fix to
   rentals was out of that task's scope.

Both are addressed here, together, since both are "stabilize what
already shipped" work rather than new product surface.

## Decision

### Quotes and Rentals share one monthly-pricing engine — no separate implementation

`QuoteItem` gains the same two snapshot columns `RentalItem` already had
(`monthlyBillingStrategy`, `customMonthLengthDays`). `quote-pricing.util.ts`'s
`computeQuoteItemPricing` now calls the exact same
`computeMonthlyBreakdown` function from `rental-pricing.util.ts` that
Rentals uses — imported, not reimplemented, continuing the existing
pattern where Quotes already imported `durationInDays`/`monthsInRange`
from that file. `QuotesService` now injects the same
`RentalBillingSettingsService` Rentals uses; a tenant configures its
monthly billing policy once, and it governs both modules identically.
`RentalBillingSettings` deliberately keeps its existing name rather than
being renamed to something more generic (e.g. `MonthlyBillingSettings`)
— a rename would touch an already-shipped Prisma model, migration
history, two permission strings (`rental_settings.view/manage`), and a
settings page route (`/app/settings/rental-billing`) for a purely
cosmetic gain. This naming mismatch is a deliberately accepted, minor
inconsistency, not a functional one.

### Legacy MONTHLY quote items fall back to the exact calculation they were originally priced under

A `QuoteItem` written before this task (`monthlyBillingStrategy` is
`null`) is never forced through the new complete-units-plus-remainder
engine and never required to retroactively have a `dailyPriceMinor` it
was never priced with. Instead, `computeQuoteItemPricing`'s `MONTHLY`
branch checks `monthlyBillingStrategy`: if set, use the new engine; if
`null`, fall back to the original `monthsInRange`-based whole-month-
rounding formula — reproducing that item's historical total exactly.
This is what "use an explicit legacy/default interpretation... do not
silently recalculate" means in practice here: the interpretation is
"this item's absence of a strategy means it was priced under the old
rule," not "assume `CALENDAR_MONTH`," because the two rules can disagree
(a period with a partial month rounds up to a whole extra month under
the old rule, but splits into a daily-priced remainder under the new
one) and defaulting to the new rule would silently change a historical
total. New items always get a strategy stamped at write time, so this
fallback only ever applies to genuinely pre-existing rows — there is no
code path in this codebase, after this task, that creates a new
`null`-strategy `MONTHLY` item.

### Quote-to-rental conversion carries the frozen snapshot, not a fresh one

When an accepted quote converts to a rental, each `ASSET`-type
`QuoteItem`'s `monthlyBillingStrategy`/`customMonthLengthDays` is copied
verbatim onto the resulting `RentalItem` — never re-resolved from the
tenant's _current_ settings at conversion time. This is necessary for
the resulting rental's item-level breakdown to remain reproducible
(`computeMonthlyBreakdown` needs the strategy the customer's price was
actually quoted under), even though — unchanged from ADR 0007 — the
Rental's own `subtotalMinor`/`totalMinor` continue to be copied verbatim
from the Quote's own authoritative totals, never recomputed from the
converted items. Duplication (`POST /quotes/:id/duplicate`) follows the
same verbatim-copy rule: a duplicated item keeps the exact strategy the
source item had, since duplication is a faithful copy in a fresh DRAFT
shell (ADR 0007), not a re-quote.

### Rental numbering becomes a real atomic sequence, mirroring quote numbering exactly

A new `RentalSequence` model (`tenantId` unique, `lastNumber`) backs
`generateRentalNumber` via a single
`INSERT ... ON CONFLICT ("tenantId") DO UPDATE SET "lastNumber" =
"lastNumber" + 1 RETURNING "lastNumber"`. This mirrors `QuoteSequence`
exactly, minus the year dimension — the existing `RNT-######` format has
never had one, and this task preserves that format rather than changing
it. Postgres's `ON CONFLICT DO UPDATE` takes a row-level lock, so two
concurrent transactions incrementing the same tenant's counter are
serialized by the database itself; no application-level lock, retry
loop, or dependency on process-local memory is needed, and the fix is
therefore safe across multiple application processes/containers, not
just within one. Verified directly against real Postgres with concurrent
HTTP requests (10-way and 25-way), not only a mocked helper — see
`test/rental-numbering.e2e-spec.ts`.

The existing `@@unique([tenantId, rentalNumber])` database constraint is
kept as the final safeguard regardless — it was already there, and
nothing about this fix removes or relies on bypassing it.

### Migration: initialize each tenant's counter from history, never renumber

The migration backfills one `RentalSequence` row per tenant that already
had rentals, set to `MAX` of that tenant's existing rental numbers that
match the standard `^RNT-[0-9]{6}$` pattern exactly. No `rentals` row is
read destructively or modified — historical rental numbers are
preserved exactly as they are. A tenant with no rentals, or whose
existing rental numbers don't match that exact pattern (in practice,
only the old generator's rare `Date.now()`-based exhausted-retry
fallback — a 13-digit value, not 6 digits), is deliberately left without
a seeded counter row: the first real call to `generateRentalNumber()`
for that tenant creates its counter starting at 1 via the same atomic
upsert every other tenant uses, which is safe because a fresh counter
starting at 1 can only theoretically collide with a pre-existing
nonstandard number if a future generated number happens to exactly
match it — a risk that already existed in, and was already accepted by,
that same old fallback path before this fix.

## Consequences

- `apps/web/src/lib/quote-pricing.ts` now imports and reuses
  `estimateMonthlyBreakdown` from `apps/web/src/lib/rental-pricing.ts`
  rather than maintaining its own calendar-month math, matching the
  backend's reuse pattern.
- The Quote wizard and quote detail page render the identical
  human-readable breakdown format Rentals already show (e.g. "2 calendar
  months × €500 + 5 days × €25"), reusing the same localization keys
  (`rental.wizard.monthlyBreakdown.*`) added for Rentals — no new
  translation keys were needed for this task.
- The known limitations "Quotes still use the old MONTHLY rounding" and
  "`generateRentalNumber`'s count-then-check race" (both documented in
  ADR 0007/ADR 0008 and `docs/HANDOVER.md`) are resolved as of this ADR
  and removed from those documents.
- The public quote page and the generated PDF do not currently render
  the itemized monthly breakdown (only the authenticated wizard and
  detail page do) — a deliberately deferred, disclosed scope boundary,
  not an oversight; the underlying data (`monthlyBillingStrategy`,
  `customMonthLengthDays`) is already included in the public API
  response shape, so adding it later is additive UI work only.
