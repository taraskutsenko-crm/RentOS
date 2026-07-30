# RentOS Vision

**One Platform. Every Asset.**

## What RentOS is

RentOS is not a CRM with a rental feature bolted on. It is a **universal
Rental Operating System**: the operational core a rental business runs
on — bookings, pricing, availability, commercial offers, and (in later
phases) contracts, handover/return protocols, and payments — built so that
the same platform serves a vehicle-rental company, a construction
equipment yard, an event-equipment supplier, a tool-rental shop, an
electronics/AV rental house, a furniture-rental business, and a
container/trailer or portable-facility operator, without forking the
product or hardcoding any one industry's vocabulary into the schema or
the business logic.

This is a deliberate, load-bearing constraint, not a marketing line. It
shows up in concrete implementation decisions already in this
repository: `Asset` has no vehicle/container/tool-specific columns —
type-specific attributes (a VIN, a tank capacity, an engine power rating)
live entirely in tenant-defined custom fields (see
[ADR 0002](adr/0002-universal-asset-model.md)); `Rental`/`RentalItem`
reference `Asset` generically; `Quote`/`QuoteItem` use an explicitly
industry-neutral `itemType` vocabulary (`ASSET`, `SERVICE`, `PRODUCT`,
`FEE`, `DELIVERY`, `COLLECTION`, `LABOR`, `CUSTOM`) rather than anything
sector-specific (see [ADR 0007](adr/0007-quotes-and-commercial-offers.md)).
Every new module added to this codebase is expected to preserve that
constraint.

## The problem being solved

Rental businesses — across every asset category above — share the same
operational shape and the same operational pain:

- Tracking what they own, its condition, its location, and its current
  availability.
- Booking it to a customer over a date range without double-booking it.
- Pricing that booking correctly — daily/weekly/monthly/custom rates,
  discounts, tax, deposits — and being able to reproduce that exact price
  later even if company pricing policy changes in the meantime.
- Producing a professional commercial offer before the customer commits,
  and turning an accepted offer into a real booking without re-keying
  anything.
- Doing all of this per-business (multi-tenant), in the business's own
  language and currency, with role-appropriate access for owners,
  managers, technicians, accountants, and read-only viewers.

Most incumbent tools solve one narrow vertical (car rental software,
tool-rental software, event-rental software) or solve general CRM/ERP
problems without the domain-specific booking/availability/pricing engine
a rental business actually needs day-to-day. RentOS's bet is that the
_rental operational core_ — not the industry label on the asset — is the
reusable part, and that a well-designed universal asset model plus a
tenant-configurable pricing engine covers the real variation between
these businesses better than a separate vertical product per industry.

## Primary users

- **Rental business owners/admins** — configure the tenant (currency,
  language, asset categories, statuses, custom fields, billing
  strategy), manage staff roles, and see the full commercial picture.
- **Operations/rental managers** — the day-to-day users: booking assets,
  preparing quotes, managing the rental lifecycle (reserve → start →
  return), handling exceptions.
- **Technicians / equipment handlers** — the physical-handling role:
  starting and returning rentals, updating asset condition/status/
  location, without commercial (pricing/booking) authority.
- **Accountants / finance staff** — read-only visibility into rentals,
  quotes, and billing configuration for bookkeeping and reconciliation.
- **Customers** (future-facing) — today reached only through the
  public, token-based quote-acceptance page; a full customer portal is
  planned (see below), not yet built.

## Value proposition

1. **One system instead of a per-vertical patchwork.** The same tenant
   model, permission system, pricing engine, and UI serve any asset
   category a business defines for itself.
2. **Correct, reproducible commercial numbers.** Money is never a float;
   pricing is server-authoritative; a rental or quote's historical total
   is guaranteed not to drift silently when tenant-wide settings change
   later (see the Historical Financial Immutability principle in
   [PRODUCT_PRINCIPLES.md](PRODUCT_PRINCIPLES.md)).
3. **Fast to operate day-to-day.** Guided wizards for the two highest-
   frequency actions (booking a rental, preparing a quote) instead of
   raw CRUD forms; live pricing feedback before submission; availability
   checking before double-booking becomes possible.
4. **Safe by construction for a multi-tenant SaaS.** Every tenant-scoped
   query is re-verified server-side; every mutation is permission-gated
   by a granular capability, never a role-name string check in a
   controller; every commercially or operationally significant action is
   audited.

## Universal asset model

Already implemented (see [ADR 0002](adr/0002-universal-asset-model.md)):
one `Asset` model with universal identity/lifecycle/financial fields,
tenant-defined categories (nested), tenant-defined custom fields (twelve
field types, category-scoped or global, with declarative — never
executable — validation rules), tenant-configurable statuses beyond a
seeded baseline, images/documents via a swappable storage abstraction,
and a full audit/status/location history timeline. Nothing in this model
assumes a specific rental industry.

## Tenant-based SaaS model

Already implemented (see
[ADR 0001](adr/0001-authentication-and-tenant-context.md)): one
`User` can belong to multiple `Tenant`s via `TenantMembership`; every
tenant-scoped request re-verifies active membership against the database
rather than trusting a client-supplied tenant ID; role-based access
control (`OWNER`, `ADMIN`, `MANAGER`, `ACCOUNTANT`, `TECHNICIAN`,
`VIEWER`) is enforced through granular, resource-scoped permissions
(`assets.read`, `rentals.reserve`, `rental_settings.manage`, …), never a
bare role-name check inside a controller.

## International and multilingual direction

Already implemented: every user-facing string in the web app is
localized (i18next), with complete parity across six languages (English,
Russian, Ukrainian, German, Polish, Spanish) verified key-by-key on every
module shipped so far; every tenant has its own default language,
currency (ISO 4217), country, and timezone captured at registration.
Adding a seventh language is additive (a new locale JSON file with the
same key structure), not a code change to any component. Planned:
right-to-left language support and locale-aware number/date formatting
beyond `Intl` defaults are not yet a distinct workstream — they are
expected to surface as real gaps only once a market that needs them is
targeted.

## AI-first long-term vision

**Not yet implemented.** The long-term direction is for AI to _perform_
rental-operations workflows on the operator's behalf — drafting a quote
from a natural-language description of what a customer needs, flagging
an asset likely to need maintenance before it's booked again, suggesting
a re-price when a competitor's market shifts, reconciling a return
against condition photos — not merely answering questions about the
data. This is a platform-level direction, not a specific committed
feature; it is listed here so implementation choices elsewhere (a
consistent, well-typed internal API surface; structured audit logs;
deterministic, explainable pricing) are made with an eventual AI-driven
automation layer in mind, without speculatively building that layer now.

## Customer portal direction

**Not yet implemented**, beyond the narrow, already-shipped public
quote-acceptance page (a token-authenticated, read-mostly view — see
[ADR 0007](adr/0007-quotes-and-commercial-offers.md)'s public-token
section). The long-term direction is a proper customer-facing portal:
authenticated customer accounts, self-service booking requests, rental
history, document/contract access, and online payment — none of which
exists today.

## Mobile application direction

**Not yet implemented.** The backend is already API-first (a REST API
consumed by a separate Next.js web client, not a server-rendered
monolith), which is the deliberate precondition for a future native or
cross-platform mobile app aimed at field staff (technicians handling
pickup/return on-site, condition photos, barcode/QR scanning against the
existing `Asset.barcode`/`qrCodeValue` fields). No mobile client exists
yet and none is scheduled in the current roadmap.

## Automation direction

Partially implemented, mostly planned. What exists today: server-side
automatic pricing recomputation, lazy quote-expiry evaluation (no cron
job — evaluated on next access), and best-effort asset-status
synchronization on rental start/return. What's planned: scheduled jobs
(the stack already anticipates BullMQ — see the Tech Stack table — but
no background-job infrastructure is wired in yet), automatic reminders
(upcoming returns, expiring quotes), and automated document generation
tied to the TASK-0008 direction below.

## Integrations and public API direction

The REST API (documented in [api.md](api.md)) is already the _only_ way
the web client talks to the backend — there is no hidden server-side-only
capability — which is what makes a public, partner-facing API a
natural, low-risk extension rather than a rebuild. **Not yet
implemented**: API key/OAuth-based third-party access, webhooks, or any
named integration (accounting software, payment processors, calendar
sync). Planned as a distinct future phase once the core operational
modules (contracts/handover, payments) are further along.

## Predictive maintenance and asset intelligence direction

**Not yet implemented.** `Asset` already carries the structural
prerequisites (status history, location history, a full timeline,
tenant-defined custom fields that could carry usage/meter data), but no
maintenance-prediction, usage-based scheduling, or asset-intelligence
feature exists yet. This is explicitly a longer-horizon direction, later
than the customer portal and mobile app in priority.

## Marketplace/platform direction

**Not yet implemented and not yet scoped in detail.** The long-term,
speculative direction is a marketplace layer connecting rental
businesses running RentOS with end-customers directly (discovery across
tenants, cross-tenant availability search) — fundamentally different
from today's single-tenant-at-a-time booking model, and not a near-term
commitment.

## Implemented vs. planned vs. long-term — summary

| Capability                                                                                | Status                                        |
| ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| Auth, multi-tenancy, RBAC                                                                 | **Implemented**                               |
| Customers module                                                                          | **Implemented**                               |
| Universal Assets module (categories, statuses, custom fields, images/documents, timeline) | **Implemented**                               |
| Rentals module (lifecycle, availability engine, pricing)                                  | **Implemented**                               |
| Configurable monthly billing strategies (Rentals)                                         | **Implemented**                               |
| Quotes and commercial offers (wizard, PDF, public acceptance, conversion)                 | **Implemented**                               |
| Configurable monthly billing strategies (Quotes)                                          | **In progress** (pre-TASK-0008 stabilization) |
| Race-safe rental-number generation                                                        | **In progress** (pre-TASK-0008 stabilization) |
| Contracts, handover/return protocols, generated documents, signatures                     | **Planned — TASK-0008**                       |
| Payments, invoicing, deposit collection/refund                                            | **Planned, later phase**                      |
| Background jobs / scheduled automation                                                    | **Planned, later phase**                      |
| Customer portal                                                                           | **Long-term direction**                       |
| Mobile application                                                                        | **Long-term direction**                       |
| Public API / third-party integrations                                                     | **Long-term direction**                       |
| AI-performed workflows (beyond conversational assistance)                                 | **Long-term direction**                       |
| Predictive maintenance / asset intelligence                                               | **Long-term direction**                       |
| Marketplace/platform                                                                      | **Long-term, unscoped direction**             |

See [ROADMAP.md](ROADMAP.md) for the phase-by-phase breakdown and
[HANDOVER.md](HANDOVER.md) for the current verified technical state.
