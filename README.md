# RentOS

**One Platform. Every Asset.**

RentOS is a multi-tenant SaaS platform for asset and rental management,
designed to support any asset type, any country, any language, subscription
billing, and future mobile clients through an API-first architecture.

> **Status:** Production infrastructure, authentication, multi-tenant RBAC,
> and the Customers, Assets, Rentals, and Quotes business modules are
> complete. Registration, login/logout, rotating refresh tokens, tenant
> onboarding, tenant-isolated access control, full customer CRUD, a
> universal Assets module (categories, tenant-configurable statuses,
> category-scoped custom fields, images/documents, status/location
> history, and a unified timeline), a universal Rentals module (booking
> wizard, lifecycle state machine, real availability/double-booking
> prevention, automatic pricing), and a Quotes and Commercial Offers
> module (quote wizard, PDF generation, public customer acceptance,
> quote-to-rental conversion) are all implemented and tested end-to-end.
> A universal **Document Management Platform** (TASK-0008, Parts 1–2) is
> also complete: the generic document model, versioning/immutability, and
> concurrency-safe numbering (Part 1), plus versioned HTML/CSS templates,
> universal variable resolution, HTML/PDF rendering, password-protectable
> public share links, email delivery with retry, and an e-signature
> provider abstraction (Part 2) — real DocuSign/Adobe Sign/Autenti/eIDAS
> integration is not built yet, only the swappable seam and a local mock
> provider. A **Customer Portal** (TASK-0009) is also complete: secure
> customer self-service with its own auth stack, a dashboard, rentals with
> a calendar view, document preview/download/e-signature/ZIP-download,
> extension requests, damage reports with photos, a message center,
> notifications, and equipment/QR-code lookup — plus a staff-facing
> invite/manage panel. The product's visible branding is now **Havelio**
> (internal package/module names are unchanged for now). Remaining
> business modules (invoicing, payments) are still out of scope until
> explicitly requested.

## Tech Stack

| Layer    | Choices                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------- |
| Frontend | Next.js, React, TypeScript, TailwindCSS v4, shadcn/ui, TanStack Query, React Hook Form, Zod, i18next |
| Backend  | NestJS, TypeScript, Prisma, PostgreSQL, Redis, Argon2id, JWT                                         |
| Infra    | Docker, Docker Compose, GitHub Actions                                                               |

Zustand, BullMQ, and OAuth are part of the platform's intended stack but
are not yet wired in — they land with the tasks that need them.

## Authentication & Multi-Tenancy

- **Auth**: email/password registration and login, `argon2id` password
  hashing, short-lived JWT access tokens + rotating refresh tokens, all
  carried in `httpOnly` cookies (never `localStorage`).
- **Tenancy**: a user may belong to multiple tenants; every tenant-scoped
  request re-verifies active membership against the database — a tenant ID
  is never trusted on its own.
- **RBAC**: `OWNER | ADMIN | MANAGER | ACCOUNTANT | TECHNICIAN | VIEWER`
  membership roles, enforced via `RolesGuard` + `@Roles(...)`.

Full details, request/response shapes, and the reasoning behind the cookie
strategy: [docs/architecture.md](docs/architecture.md),
[docs/api.md](docs/api.md), and
[ADR 0001](docs/adr/0001-authentication-and-tenant-context.md).

## Customers

The first business module: full CRUD (`POST`/`GET`/`PATCH`/`DELETE` under
`/tenants/:tenantId/customers`), search across name/company/email/phone,
status filtering, pagination, and soft delete. Every request is scoped by
`tenantId` server-side (`TenantGuard`) — never trusted from the URL alone.
See [docs/api.md](docs/api.md#customers) for the full endpoint reference.

## Assets

A universal module for renting and managing **any** kind of physical
property — vehicles, containers, tools, generators, portable toilets, and
anything else a tenant defines. Business logic is never tied to one asset
type: type-specific attributes (a VIN, a tank capacity, an engine power
rating) are represented entirely through tenant-defined custom fields, not
hardcoded columns. Covers:

- **Categories** — tenant-scoped, nested (`AssetCategory`), with cycle
  prevention and safety checks before deletion.
- **Assets** — universal identity/lifecycle/financial fields, money always
  stored as integer minor units + a validated ISO 4217 currency, full-text
  and custom-field search, pagination, and filtering.
- **Statuses** — eight system statuses seeded per tenant
  (`AVAILABLE`, `RESERVED`, `RENTED`, `INSPECTION_REQUIRED`,
  `MAINTENANCE`, `REPAIR`, `LOST`, `RETIRED`) plus unlimited
  tenant-defined custom statuses; every status change is recorded in
  `AssetStatusHistory`.
- **Custom fields** — category-scoped or global, twelve field types,
  declarative (non-executable) validation rules, enforced on asset
  create/update.
- **Images & documents** — S3-compatible storage abstraction with a
  local-filesystem development adapter, MIME/size-validated uploads, one
  primary image per asset, soft delete plus storage cleanup.
- **Timeline** — a normalized, chronological feed combining creation,
  updates, status changes, location changes, and file uploads for one
  asset.
- **Granular permissions** — `assets.*`, `asset_categories.*`,
  `asset_statuses.*`, and `asset_fields.*`, enforced by a reusable
  `PermissionsGuard` (never role-name checks in controllers).

See [docs/api.md](docs/api.md#assets) for the full endpoint reference, and
[docs/adr/0002-universal-asset-model.md](docs/adr/0002-universal-asset-model.md)
through
[docs/adr/0005-asset-file-storage-strategy.md](docs/adr/0005-asset-file-storage-strategy.md)
for the design rationale.

## Rentals

The core rental engine: books one or more Assets (any type — never
container/vehicle/equipment-specific) to a Customer over a shared planned
date window, with real availability checking that prevents double-booking.
Covers:

- **Lifecycle** — `DRAFT → QUOTE → RESERVED → ACTIVE → RETURNED → COMPLETED`,
  with cancellation from any non-terminal state; every transition writes a
  `RentalStatusHistory` row in the same transaction as the status change.
- **Availability engine** — queries confirmed (`RESERVED`/`ACTIVE`)
  bookings directly (never a single status field) to support future
  reservations, back-to-back same-day turnover, and assets freed
  immediately by a partial return.
- **Automatic pricing** — daily/weekly/monthly/custom billing modes,
  item- and rental-level discounts plus tax, money always in integer minor
  units, recomputed and stored on every create/update.
- **Configurable monthly billing** — a tenant-level
  `CALENDAR_MONTH` (default) / `FIXED_30_DAYS` / `CUSTOM` strategy splits
  a `MONTHLY` item's period into complete monthly units plus a
  daily-priced remainder (e.g. Jan 15 → Mar 20 = 2 calendar months + 5
  days); each rental snapshots the strategy it was priced under, so a
  later settings change never alters an existing rental's stored total.
- **Partial returns** — return some items while a rental stays `ACTIVE`;
  each returned asset is immediately available for a new booking.
- **Concurrency-safe numbering** — `RNT-000001`, backed by an atomic
  Postgres upsert-increment sequence, same pattern as Quotes' numbering
  (see [ADR 0009](docs/adr/0009-shared-monthly-pricing-and-atomic-rental-numbering.md)).
- **Booking wizard** — a 6-step guided flow (customer → assets → dates →
  pricing → review → create) plus a visual availability calendar.
- **Granular permissions** — `rentals.view/create/update/delete/reserve/
start/return/cancel` plus `rental_settings.view/manage` for the billing
  strategy settings, enforced by the same `PermissionsGuard` as Assets.

See [docs/api.md](docs/api.md#rentals) for the full endpoint reference,
[ADR 0006](docs/adr/0006-rental-lifecycle-and-availability.md) for the
lifecycle, availability, and pricing design rationale,
[ADR 0008](docs/adr/0008-configurable-monthly-billing-strategies.md) for
the configurable monthly billing strategy design, and
[ADR 0009](docs/adr/0009-shared-monthly-pricing-and-atomic-rental-numbering.md)
for the shared-with-Quotes pricing engine and the race-safe numbering fix.

## Quotes

Prepares professional commercial offers before any Rental is created — a
Quote never reserves an asset by itself. Covers:

- **Lifecycle** — `DRAFT → SENT → VIEWED → ACCEPTED → CONVERTED`, with
  `REJECTED`/`EXPIRED` reachable from `SENT`/`VIEWED` and `CANCELLED` from
  `DRAFT`/`SENT`; every transition writes a `QuoteStatusHistory` row.
  Expiry is evaluated lazily against `validUntil`, not via a scheduled job.
- **Universal line items** — `ASSET`, `SERVICE`, `PRODUCT`, `FEE`,
  `DELIVERY`, `COLLECTION`, `LABOR`, `CUSTOM`; daily/weekly/monthly/
  custom/flat pricing, per-line and quote-level percentage or fixed
  discounts, per-line tax rates, and deposits — all integer minor units
  and integer basis points, never floating point.
- **Configurable monthly billing, shared with Rentals** — `MONTHLY`
  quote items use the exact same tenant-level `CALENDAR_MONTH` (default)
  / `FIXED_30_DAYS` / `CUSTOM` strategy as Rentals (see
  [ADR 0008](docs/adr/0008-configurable-monthly-billing-strategies.md)),
  never a separate calculation; each item snapshots the strategy it was
  priced under, and quote-to-rental conversion carries that snapshot
  onto the resulting rental item.
- **Concurrency-safe numbering** — `Q-2026-000001`, backed by an atomic
  Postgres upsert-increment sequence (not a count-then-check pattern) —
  the same pattern Rentals' own numbering now uses too (see
  [ADR 0009](docs/adr/0009-shared-monthly-pricing-and-atomic-rental-numbering.md)).
- **PDF generation** — a localization-aware, A4, multi-page-safe
  commercial offer (itemized table, totals, terms, acceptance section),
  rendered via `pdfkit` with an embedded Unicode font, stored through the
  same storage abstraction Assets uses.
- **Email preparation** — a swappable `EmailProvider` abstraction (mirrors
  the Storage adapter pattern); a logging/development provider ships
  today, a production SMTP/SES/SendGrid provider is a documented future
  swap.
- **Public customer acceptance** — a hashed, expiring, token-based public
  link (no login required) to view, download the PDF, accept, or reject
  a quote; every action is idempotent and rate-limited.
- **Quote-to-Rental conversion** — only an `ACCEPTED` quote converts,
  inside one transaction that revalidates the customer/assets/
  availability and creates a `RESERVED` Rental permanently linked back to
  its source Quote.
- **Duplication** — a fresh `DRAFT` copy with a new number and cleared
  acceptance/rejection/conversion metadata, in place of a full
  revision-chain system (see ADR 0007 for why).
- **Granular permissions** — `quotes.view/create/update/delete/send/
accept/reject/convert/duplicate/download/manageTemplates`, enforced by
  the same `PermissionsGuard` as every other module.

See [docs/api.md](docs/api.md#quotes) for the full endpoint reference, and
[ADR 0007](docs/adr/0007-quotes-and-commercial-offers.md) for the
numbering, pricing, PDF, email, and public-acceptance design rationale.

## Document Management Platform

The generic document engine meant to cover Contracts, Handover/Return
Protocols, Damage Reports, Contract Amendments, and future types —
**not** a PDF module and **not** a Contract module. TASK-0008 shipped in
two parts.

**Part 1 — architecture and domain model:**

- **One generic `Document` model** for every document type — no
  type-specific columns; type-specific content lives entirely in untyped
  JSON (`businessDataSnapshot`/`dataJson`), so a new document type never
  requires a schema change.
- **Immutable versioning** — a document's current version is mutable only
  while `DRAFT`; the moment it leaves `DRAFT` it's finalized forever, and
  any later correction creates a brand-new version (parent-linked,
  reason required) rather than editing history.
- **Lifecycle** — `DRAFT → READY → SENT → (VIEWED →)
PARTIALLY_SIGNED/SIGNED/REJECTED → ARCHIVED`, `VOIDED` reachable from
  any non-terminal state; every transition is audited and history-tracked.
- **Concurrency-safe numbering** per document type (`CON-000001`,
  `HD-000001`, `RT-000001`, `DMG-000001`, `AMD-000001`, and year-scoped
  `DOC-2026-000001` for `CUSTOM`), the same atomic upsert-increment
  pattern Rentals/Quotes use — verified under 20 concurrent requests.

**Part 2 — templates, rendering, sharing, email, e-signature foundation:**

- **Versioned HTML/CSS templates** — one `ACTIVE` template per
  `(tenant, documentType)`, content edits always create a new version,
  every document type renders correctly out of the box via a built-in
  default template even with zero tenant setup.
- **Universal variable resolution** — `{{company.name}}`-style
  placeholders resolved against company/customer/employee/asset/rental/
  quote/signature/notes data, HTML-escaped, with no hardcoded variable
  whitelist — new variables just work.
- **HTML/PDF rendering** — HTML is always recomputed live, never stored;
  PDFs are generated via a reused headless Chromium instance (Puppeteer)
  and cached per version until a forced regeneration.
- **Public sharing** — password-optional, expiring, SHA-256-hashed-token
  share links with view/download tracking, no login required.
- **Email delivery** — synchronous send with a durable, retryable
  delivery history, reusing the existing `EmailProvider` abstraction.
- **E-signature foundation** — a swappable `DocumentSignatureProvider`
  seam (DocuSign/Adobe Sign/Autenti/eIDAS named as future providers), a
  local mock provider only for now.
- **Granular permissions** — `documents.view/create/update/delete/send/
sign/void/archive/download/render/share/templates.view/templates.manage`.
- **Full frontend UI** — document list/detail/preview, template registry
  and editor, and a public share page.

See [ADR 0010](docs/adr/0010-document-management-platform.md),
[ADR 0011](docs/adr/0011-document-rendering-and-sharing.md), and
[docs/api.md](docs/api.md#document-management-platform-task-0008-parts-1-2)
for the full design rationale and endpoint reference.

## Customer Portal

A premium, enterprise-grade self-service experience for end customers —
its own auth stack, entirely separate from staff login (see
[ADR 0012](docs/adr/0012-customer-portal.md)):

- **Secure invitation-based onboarding** — staff invite a customer by
  email; the customer sets their own password to activate the account.
- **Dashboard** — current/upcoming rentals, unread messages, pending
  signatures, pending extension requests, recent rentals at a glance.
- **Rentals** — list, detail, rental timeline, and a lightweight calendar
  view; internal-only fields are never exposed to the customer.
- **Documents** — HTML preview, PDF download, e-signature (reuses the
  Document Management Platform's signature abstraction), and a one-click
  ZIP download of every document for a rental.
- **Extension requests** — customer-submitted, staff approve/decline;
  approval genuinely extends the rental (availability-checked, re-priced)
  via a new `RentalsService.extendPlannedEnd()` capability.
- **Damage reports** — customer-submitted with photo uploads; staff
  review and can convert a report into a real, signable Document.
- **Message center & notifications** — a threaded conversation per
  customer, and an in-app notification feed for messages, extension
  responses, and damage-report updates.
- **Equipment info & QR codes** — read-only asset details (no financial
  fields) and a scannable QR code linking back to the authenticated
  rental page.
- **Staff-side management** — an invite/revoke panel plus extension
  request, damage report, and message management embedded on the
  existing customer detail page, gated by a new
  `customers.portal.manage` permission.
- **Dark mode, full localization (6 languages), responsive layout.**

See [ADR 0012](docs/adr/0012-customer-portal.md) and
[docs/api.md](docs/api.md#customer-portal-task-0009) for the full design
rationale and endpoint reference.

## Monorepo Structure

```
apps/
  web/            Next.js frontend — App Router, Tailwind v4, auth + customers pages, protected /app shell, public quote page
  api/            NestJS backend — auth, users, tenants, memberships, customers, assets, rentals, quotes, email, permissions, storage, audit modules
packages/
  ui/             Shared UI component library (Tailwind v4 + shadcn/ui)
  shared/         Shared types, env validation (zod), country config, constants
  localization/   Shared i18n resources (en, ru, uk, de, pl, es)
  config/         Shared TypeScript & ESLint configuration
docs/             Architecture notes, API reference, ADRs
docker/           Dockerfiles + compose stack (postgres, redis, api, web)
scripts/          Repository automation (reserved)
.github/          CI workflow (install, build, lint, typecheck)
```

This repository is managed with [pnpm workspaces](https://pnpm.io/workspaces)
and [Turborepo](https://turbo.build/repo).

## Requirements

- Node.js >= 20
- pnpm (see `packageManager` in [package.json](package.json))
- Docker + Docker Compose (for PostgreSQL/Redis, or running the full stack)

## Getting Started

```bash
cp .env.example .env
pnpm install

# Start PostgreSQL and Redis
docker compose --env-file .env -f docker/docker-compose.yml up -d postgres redis

# Apply database migrations
pnpm --filter @rentos/api prisma:deploy

# Run the API and web app in dev mode
pnpm dev
```

Then visit `http://localhost:3000/register` to create an account, or run
the entire stack (web, API, Postgres, Redis) in Docker:

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d
```

See [docker/README.md](docker/README.md) for details.

## Available Scripts

| Script              | Description                              |
| ------------------- | ---------------------------------------- |
| `pnpm build`        | Build all workspaces via Turborepo       |
| `pnpm dev`          | Run all workspaces in development mode   |
| `pnpm lint`         | Lint all workspaces via Turborepo        |
| `pnpm typecheck`    | Type-check all workspaces via Turborepo  |
| `pnpm format`       | Format the repository with Prettier      |
| `pnpm format:check` | Check formatting without writing changes |

Per-app scripts:

| Script                                      | Description                               |
| ------------------------------------------- | ----------------------------------------- |
| `pnpm --filter @rentos/api test`            | Backend integration tests (real Postgres) |
| `pnpm --filter @rentos/web test`            | Frontend component tests                  |
| `pnpm --filter @rentos/api prisma:generate` | Generate the Prisma Client                |
| `pnpm --filter @rentos/api prisma:migrate`  | Create/apply a migration in development   |
| `pnpm --filter @rentos/api prisma:deploy`   | Apply pending migrations (production)     |
| `pnpm --filter @rentos/api prisma:studio`   | Open Prisma Studio                        |

## Database

Prisma is configured against PostgreSQL in
[`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma):
`User`, `Tenant`, `TenantMembership`, `RefreshToken`, `AuditLog`,
`Customer`, `AssetCategory`, `Asset`, `AssetStatusDefinition`,
`AssetStatusHistory`, `AssetLocationHistory`, `AssetCustomFieldDefinition`,
`AssetCustomFieldValue`, `AssetImage`, `AssetDocument`, `Rental`,
`RentalItem`, `RentalStatusHistory`, `Quote`, `QuoteItem`,
`QuoteStatusHistory`, `QuoteDocument`, `QuoteSequence`, plus
`MembershipRole`/`MembershipStatus`/`CustomerStatus`/`AssetFieldType`/
`AssetDocumentType`/`RentalStatus`/`RentalBillingMode`/`QuoteStatus`/
`QuoteItemType`/`QuoteBillingMode`/`QuoteDiscountType` enums. No other
business schema (invoicing, payments) has been added.

## Environment Variables

See [`.env.example`](.env.example) at the repository root (used by Docker
Compose), and `.env.example` in [`apps/api`](apps/api/.env.example) /
[`apps/web`](apps/web/.env.example) for running each app directly outside
Docker. Environment variables consumed by the API are validated at startup
via a zod schema in [`packages/shared`](packages/shared/src/env.ts). See
[docs/architecture.md](docs/architecture.md#required-environment-variables)
for the auth-specific variables, and
[docs/architecture.md#asset-file-storage](docs/architecture.md#asset-file-storage)
for `STORAGE_LOCAL_DIR`. Quotes' email sending requires no environment
variables today (the shipped `LoggingEmailProvider` takes none) — see
[docs/architecture.md#email](docs/architecture.md#email) for how a
production SMTP/SES/SendGrid provider (and its credentials) would be
wired in later.

## Roadmap

See [docs/PRODUCT_BIBLE.md](docs/PRODUCT_BIBLE.md) for the product
philosophy and decision framework every feature is checked against,
[docs/ROADMAP.md](docs/ROADMAP.md) for the full, status-tagged
roadmap, including the agreed TASK-0010–TASK-0020 sequence, and
[docs/ARCHITECTURE_LOCK.md](docs/ARCHITECTURE_LOCK.md) for the
governance rules every future task must follow.

Deliberately out of scope so far:

- Invoices, payments, deposit collection/refund workflows,
  maintenance/repair workflows
- Branches, warehouses, GPS tracking
- OAuth, production email sending (a development/logging provider ships
  today — see [Quotes](#quotes)), password reset, two-factor
  authentication, portal notification emails (in-app only today — see
  [Customer Portal](#customer-portal))
- Theming, background jobs (BullMQ)
- Quote PDF/email template customization (`quotes.manageTemplates` is a
  reserved permission with no template editor behind it yet)

These will be introduced in subsequent, explicitly scoped tasks.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

See [LICENSE](LICENSE).
