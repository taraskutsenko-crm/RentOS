# ADR 0006: Rental Lifecycle and Availability Engine

**Status:** Accepted
**Date:** 2026-07-28

## Context

TASK-0006 adds the core rental engine: booking one or more Assets (any type —
never container/vehicle/equipment-specific) to a Customer over a shared
planned date window, moving through a defined lifecycle, while guaranteeing
an asset can never be double-booked. This ADR covers the four design
decisions with the widest blast radius: the domain model, the lifecycle
state machine, the availability engine, and the pricing calculation.

## Decision

### One `Rental` + `RentalItem[]`, universal like Asset

A `Rental` belongs to one `Customer` and has exactly one shared planned date
window (`plannedStart`/`plannedEnd`); each `RentalItem` books one `Asset`
within that window with its own billing mode and price. Nothing here is
type-specific — a rental can mix a generator, a trailer, and a folding
chair in one order, exactly as required. `RentalItem.quantity` is a pricing
multiplier only: the current `Asset` model (ADR 0002) represents one
serialized physical unit per row, so availability/overlap checking is
always per-`assetId`, never divided by `quantity`. A future "fungible pool"
asset type (e.g. "50 identical folding chairs as one bookable quantity")
would need its own extension to the Asset model — explicitly out of scope
here.

### Route namespace: `/tenants/:tenantId/rentals`, not flat `/rentals`

The master spec lists flat routes (`GET /rentals`, `POST /rentals/:id/reserve`,
...). Every other business module in this codebase — Customers, Assets,
and everything under it — is namespaced under `/tenants/:tenantId/...`
specifically because `TenantGuard` resolves and re-verifies tenant
membership from that route param (falling back to a cookie only as a
convenience) on every single request; this is the mechanism ADR 0001
designed for "never trust a tenant ID that didn't come from a verified
membership row." A flat `/rentals` route would have to invent a different,
one-off tenant-resolution path for this module alone, which is both
inconsistent and a strictly weaker guarantee than what already exists.
Given the task's own explicit requirements — "Prevent... cross-tenant
access" and "Use the existing permission system" — namespacing under
`/tenants/:tenantId/rentals` is what those requirements actually call for
in this codebase, not a deviation from them. Documented the same way ADR
0005 documented its own pragmatic additions beyond a literal endpoint list.

### Lifecycle: seven statuses, cancellation from any non-terminal state

```
DRAFT → QUOTE → RESERVED → ACTIVE → RETURNED → COMPLETED
  ↓       ↓         ↓         ↓
                 CANCELLED (from DRAFT, QUOTE, RESERVED, or ACTIVE)
```

- **DRAFT/QUOTE** — editable: items and planned dates may still change
  freely (`RentalsService.update` enforces this; both statuses are
  functionally identical today — `QUOTE` exists as a distinct value for a
  tenant's own workflow labeling, e.g. "sent to customer for approval" —
  and both are reachable from `POST /rentals` and stay editable until
  reserved).
- **RESERVED** — the confirmed booking. Items and dates become immutable
  from here on (`ConflictException` if a client attempts to `PATCH` them);
  this is also the point where the availability engine performs its one
  hard check (see below) — a rental can sit in DRAFT/QUOTE indefinitely
  without claiming an asset.
- **ACTIVE** — set by `POST .../start`; records `actualStart`. As a
  best-effort side effect (see below), every item's asset is moved to the
  tenant's `RENTED` system status.
- **RETURNED** — set by `POST .../return` once every item has been
  returned; records `actualEnd`. Partial returns (see below) keep the
  rental `ACTIVE` until the last item comes back.
- **COMPLETED** — reserved for a future task (e.g. after invoicing);
  nothing in TASK-0006 transitions a rental here automatically. Included
  in the enum now so `RETURNED → COMPLETED` doesn't require a migration
  later.
- **CANCELLED** — reachable from `DRAFT`, `QUOTE`, `RESERVED`, or `ACTIVE`
  (`RentalsService.CANCELLABLE_STATUSES`) — not from `RETURNED` or
  `COMPLETED`, which represent a rental that already ran its course.
  Cancelling an `ACTIVE` rental implicitly closes out (marks `returnedAt`)
  and releases every not-yet-returned item, exactly as if it had been
  returned, so the assets aren't left permanently "stuck" claimed.

Every transition writes one `RentalStatusHistory` row and the `Rental`
status update in the same `$transaction` — they can never diverge — plus
an `AuditLog` entry (`rental.status_changed`, or `rental.returned` for the
return endpoint specifically, since a partial return doesn't always change
the overall status but is still a distinct, auditable event).

### Availability engine: query confirmed bookings directly, never trust a status field

`AvailabilityService` is the single source of truth for "is this asset
free for this date range." It never relies on `Asset.currentStatusId`
alone — a single status field cannot represent per-date-range availability
for **future** reservations (the task's own explicit requirement). Instead
it queries `RentalItem` rows whose parent `Rental.status` is `RESERVED` or
`ACTIVE` (the only two statuses that represent a _confirmed_ claim — a
`DRAFT`/`QUOTE` never blocks anything) and checks for interval overlap
against the requested window, using a **half-open interval**
(`existingStart < requestedEnd && existingEnd > requestedStart`) so a
rental ending exactly when another begins does not conflict — same-day
turnover is explicitly allowed, matching real rental-yard practice.

An item that was returned early (`RentalItem.returnedAt` set, via a
partial return) stops blocking from that moment on, even if the rental's
overall planned window hasn't ended yet — the "effective end" used in the
overlap check is `returnedAt ?? rental.plannedEnd`. This is what makes
partial returns actually free up an asset for a new booking immediately,
not just at the original planned end.

`assertAvailable` is called exactly once, at `POST .../reserve` — not at
`POST /rentals` (draft creation never claims anything) and not on every
`PATCH` (which would make editing a quote needlessly slow and would
re-litigate availability for a booking that was never confirmed). This
also means two tenants' staff can build competing draft quotes for the
same asset/dates without either blocking the other — only the first to
actually reserve wins, exactly matching "prevent double booking" without
over-restricting the exploratory quoting phase.

### Pricing: minor units everywhere, one line-total formula per billing mode

Prices follow the same non-negotiable rule as the Assets module (ADR
0002): every amount is an integer in minor currency units, currency is a
validated ISO 4217 code, and floating point is never used. `RentalItem`
carries all four possible unit prices (`dailyPriceMinor`,
`weeklyPriceMinor`, `monthlyPriceMinor`, `customPriceMinor`); exactly one
is meaningful, selected by `billingMode`
(`apps/api/src/rentals/rental-pricing.util.ts`):

- **DAILY/WEEKLY/MONTHLY** — `unitPrice × ceil(durationInDays / periodDays) × quantity`,
  minus the item's own `discountMinor`, floored at 0. A rental spanning
  any part of a day counts that whole day (a same-day rental is 1 day,
  never 0). A "month" is simplified to a flat 30 days — documented, not
  hidden; a calendar-accurate month (28–31 days) would need to know the
  actual start date's month length, adding complexity not justified for
  this task.
- **CUSTOM** — a single negotiated flat price for the whole line,
  ignoring both duration _and_ quantity (it's the one mode meant for "we
  agreed on one total price for this," not a per-unit rate).

`Rental.subtotalMinor` is the sum of every item's line total;
`Rental.totalMinor = subtotalMinor − Rental.discountMinor + Rental.taxMinor`
(also floored at 0), where `Rental.discountMinor`/`taxMinor` are an
_additional_ rental-level adjustment on top of each item's own discount —
giving both a per-line discount (e.g. "10% off this specific generator")
and an overall-order discount/tax. Both totals are recomputed and
persisted on every create/update (so a draft/quote always shows live,
accurate pricing) — never computed lazily on read.

The frontend wizard mirrors this exact formula
(`apps/web/src/lib/rental-pricing.ts`) purely for live UI feedback before
submission; it is never trusted as the source of truth — the API always
recomputes and stores the authoritative totals from the submitted item
data, exactly as the Assets module's money-conversion boundary already
established.

### Asset status sync: a best-effort side effect, not part of the state machine

When a rental starts, every item's asset is moved to the tenant's `RENTED`
system status; when items return (fully or partially) or an active rental
is cancelled, the released assets move back to `AVAILABLE`
(`RentalsService.syncAssetStatuses`, via the existing
`AssetsService.changeStatus`/`AssetStatusesService.findByCode`). This
happens **after** the rental's own transaction commits, not inside it —
NestJS/Prisma transactions don't nest across service boundaries without
deep coupling, and the availability engine (the actual correctness
guarantee against double-booking) never depends on this side effect
anyway; it always queries `RentalItem` rows directly. If the asset-status
sync call were to fail for some reason, the rental's own state transition
and history/audit trail remain correct and committed — only the
Assets module's cosmetic "current status" display would lag, self-healing
on the next status-changing action. This tradeoff (eventual consistency
for a secondary, cross-module display concern vs. full distributed-
transaction complexity) mirrors the kind of pragmatic call ADR 0004 made
for system-status seeding.

### Partial returns

`POST .../return` accepts an optional `itemIds` array; omitted means
"return everything not yet returned." Each targeted `RentalItem` gets
`returnedAt` set; the parent `Rental` only transitions to `RETURNED`
(and gets `actualEnd`) once **every** item has a `returnedAt` — a partial
return keeps the rental `ACTIVE`, records an `rental.returned` audit entry
noting exactly which items/assets came back, and — combined with the
availability engine's early-return handling above — immediately frees
those specific assets for new bookings, while the rest of the order
continues as normal.

## Consequences

- `RentalItem.quantity` has no effect on availability capacity (see
  above) — a known, documented limitation tied directly to the current
  Asset model, not something this task's pricing/booking logic can fix
  on its own.
- Deleting a `Rental` record (`DELETE /rentals/:id`) is restricted to
  `DRAFT`/`QUOTE`/`CANCELLED` — a `RESERVED`/`ACTIVE`/`RETURNED`/`COMPLETED`
  rental is real operational history and must be cancelled, never
  removed, mirroring how Assets/Customers never hard-delete either.
- Asset-status sync being best-effort/eventually-consistent (not
  transactional) is an accepted tradeoff — see above. A future task could
  add a reconciliation job if this class of divergence ever proves to
  matter in practice; not built speculatively here.
- `COMPLETED` is a defined enum value with no code path that reaches it
  yet — reserved for a future invoicing/completion task, out of scope
  here per the master spec's explicit restrictions list (no invoices,
  payments, etc. in this task).
