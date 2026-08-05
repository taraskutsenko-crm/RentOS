# RentOS — Handover Document

Written so a new developer, or a fresh AI session with zero prior chat
history, can resume work immediately by reading this file plus the
linked docs — without needing to reconstruct context from git log or
prior conversations.

> **Read [`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md) before starting
> any task.** It is mandatory guidance for every future development
> task and AI session in this repository: which architectural
> principles are locked, which areas are extensible, which changes
> require a new ADR before implementation, which shortcuts are
> forbidden outright, and the verification contract every task must
> satisfy before it's considered done.

## Latest verified state

- **Branch:** `main`
- **Latest verified commit:** _pending — commit/push/CI in progress for
  TASK-0010 Part 2 Chapter 4 (Dashboard Experience)._
- **What shipped:** one shared `apps/web/src/components/dashboard/`
  system (`DashboardGrid`, `DashboardMetric`, `DashboardCard`,
  `DashboardSection`, `DashboardSkeleton`, `EmptyDashboardState`,
  `QuickActions`, `RecentActivity`) plus
  `apps/web/src/hooks/use-dashboard-stats.ts`, which composes existing
  staff list endpoints (no new backend) into a real KPI set. The staff
  dashboard (`apps/web/src/app/app/page.tsx`, previously a stub) is
  rebuilt into a real dashboard: 5 permission-gated KPI cards
  (Customers, Active rentals, Available assets, Pending quotes, Needs
  attention), Quick Actions, and Recent Rentals/Recent Documents. The
  portal dashboard (`apps/web/src/app/portal/(shell)/dashboard/page.tsx`)
  is refactored onto the same shared components (its data source,
  `usePortalDashboard()`, is unchanged). A latent bug in the header's
  `QuickCreate` dropdown was also fixed: it was missing the "New
  document" action added in Chapter 3, now sourced from one shared
  `apps/web/src/lib/quick-actions.ts` list instead of two independently
  hand-written ones. See `UI_REDESIGN_PLAN.md` Chapter 4 for the full
  design rationale, including the documented gaps (no cross-entity
  activity feed, no "documents awaiting signature" KPI, no charts —
  none buildable without a new backend endpoint, which this chapter's
  scope forbids).
- **Quality gates:** format/lint/typecheck/build green across all 6
  packages; 465 backend + 234 frontend tests passing (699 total,
  including 4 new dashboard test files — `dashboard-metric.test.tsx`,
  `recent-activity.test.tsx`, `quick-actions.test.tsx`,
  `app-dashboard-page.test.tsx` — and updated assertions in
  `portal-dashboard-page.test.tsx` for the new skeleton-based loading
  state).
- **Docker/browser verification:** the `web` image was rebuilt and
  redeployed into the running Docker Compose stack. Verified end-to-end
  with a real tenant/customer/asset/rental/quote/document created live
  through the UI (not fabricated): every KPI reflects genuine live
  data — including "Available assets" correctly dropping from 1 to 0
  the moment the asset's rental started, proving the metric reads real
  state, not a cached/static number. Verified: permission-gated widgets
  (OWNER role sees all five KPI cards, Quick Actions, and both Recent
  Rentals/Recent Documents panels), empty states (inbox icon + message
  before any data existed), loading states (accessible
  `role="status"`/`aria-label` skeletons, confirmed via component
  tests), dark mode (staff and portal dashboards), responsive layout at
  375px/768px/1024px/1440px plus 200% browser zoom, keyboard tab order
  and visible focus (KPI cards with an `href` are reachable and
  skipped correctly when they have none, e.g. "Needs attention"), and
  zero console errors on any page. The portal dashboard was verified
  through a real invite → activate → login flow, confirming the
  refactored `RecentActivity`/`DashboardCard`/`DashboardMetric`
  components render its existing `usePortalDashboard()` data
  identically to before, just without the old ad hoc markup.
- **GitHub Actions:** _pending — will be updated once pushed and green._

> Update-in-place marker: the "Latest verified state" section above must
> be the first thing updated when a task pushes new green CI. Do not let
> this drift — a wrong commit hash here is worse than no hash at all.

## Repository purpose

RentOS is a multi-tenant SaaS "Rental Operating System" — see
[VISION.md](VISION.md) for the full product framing. This file is the
practical, technical resume-work reference; VISION/ROADMAP explain _why_
and _what's next_, PRODUCT_PRINCIPLES explains _how we decide_, this file
explains _how the code is actually laid out and how to work in it_.

## Technology stack

| Layer    | Choices                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend | Next.js (App Router), React, TypeScript, TailwindCSS v4, shadcn/ui (`@rentos/ui`), TanStack Query, React Hook Form, Zod, i18next             |
| Backend  | NestJS, TypeScript (strict), Prisma ORM, PostgreSQL, Redis, Argon2id password hashing, JWT (access + rotating refresh tokens)                |
| Infra    | Docker, Docker Compose, GitHub Actions CI, Turborepo, pnpm workspaces                                                                        |
| PDF      | `pdfkit` (chosen over headless-browser PDF generation for Docker/CI reliability), `dejavu-fonts-ttf` for embedded Unicode (Cyrillic) support |

Node.js >= 20 required (`package.json` `engines`); pnpm is the package
manager (`packageManager: pnpm@11.17.0`).

## Monorepo / workspace structure

```
apps/
  api/        NestJS backend
  web/        Next.js frontend
packages/
  config/     Shared tsconfig/build config
  shared/     Shared TypeScript types/env schema (apiEnvSchema, etc.)
  ui/         shadcn/ui component library (@rentos/ui)
  localization/  i18next resources — src/locales/{en,ru,uk,de,pl,es}/common.json
docker/
  docker-compose.yml   full stack: postgres, redis, api, web
docs/         this documentation set
.github/workflows/ci.yml   CI pipeline (see below)
```

Turborepo orchestrates `build`/`lint`/`typecheck`/`test` across all
packages via `turbo.json`'s task graph (typecheck depends on `^build`,
not `^typecheck` — a deliberate fix, see commit `6b739f1`).

## Application architecture

- **API-first**: the web app talks to the API purely over REST
  (documented in [api.md](api.md)); there is no server-side-only
  capability hidden from that surface.
- **Multi-tenant, single-database**: one Postgres database, every
  tenant-scoped table carries a `tenantId` column, every query is scoped
  by it server-side. No schema-per-tenant or database-per-tenant.
- **NestJS module-per-domain**: `auth`, `tenants`, `customers`, `assets`
  (+ `asset-categories`, `asset-statuses`, `asset-custom-fields`,
  `asset-files`), `rentals`, `rental-billing-settings`, `quotes`,
  `documents`, `customer-portal` (its own, fully separate auth stack — see
  ADR 0012), `email`, `permissions`, `audit`, `storage`, `prisma`, `health`.

## Backend structure (`apps/api/src`)

Each domain module follows the same shape:

```
<domain>/
  <domain>.module.ts       NestJS module: imports/providers/controllers/exports
  <domain>.controller.ts   @Controller("tenants/:tenantId/<domain>") + guards
  <domain>.service.ts      business logic, Prisma access, transactions
  <domain>.types.ts        Prisma include consts + view/response types
  dto/                     class-validator DTOs for request bodies
  *.spec.ts                colocated unit tests (pure functions/services)
```

Cross-cutting modules: `permissions/` (the `Permission` union type,
`ROLE_PERMISSIONS` map, `PermissionsGuard`, `@RequirePermissions(...)`
decorator — **controllers never check `MembershipRole` names directly**),
`audit/` (`AuditService.log(input, tx?)` — accepts an optional
transaction client so an audit row commits atomically with the action it
records), `tenants/` (`TenantGuard`, `CurrentTenant()` decorator —
re-verifies active membership against the database on every request).

Global guards: `JwtAuthGuard` (applied globally, `@Public()` escapes it
for register/login/refresh and the public quote endpoints).

## Frontend structure (`apps/web/src`)

```
app/
  app/                 authenticated app shell (layout.tsx has the nav)
    customers/ assets/ rentals/ quotes/ settings/...
  login/ register/    public auth pages
  quote/[token]/       public, token-authenticated quote acceptance page
components/<domain>/  wizards and row components (RentalWizard, QuoteWizard, QuoteItemRow, ...)
hooks/use-<domain>.ts  TanStack Query hooks (queries + mutations, cache invalidation on mutation success)
lib/
  api-client.ts        fetch wrapper, credentials:"include", ApiError class
  <domain>-pricing.ts  client-side pricing *estimate* mirrors — NEVER trusted, API recomputes authoritatively
  validation.ts        all Zod schemas, one object per form
  permissions.ts       mirrors apps/api/src/permissions/permission.ts exactly (UX convenience only, not a security boundary)
  i18n.ts              i18next init, imports `resources` from @rentos/localization
types/<domain>.ts       hand-written TS types mirroring API response shapes
```

Wizard pattern (Rentals, Quotes): a `STEPS` tuple, `useState` step index,
React Hook Form for scalar fields + a plain `useState` array for line
items, per-step `trigger()` validation, a live pricing estimate computed
from the client-side pricing-mirror lib.

## Database and Prisma structure

Single `apps/api/prisma/schema.prisma`, migrations in
`apps/api/prisma/migrations/`. Conventions (non-negotiable, apply to
every new model):

- `id String @id @default(uuid())` — client-generated UUID, never a
  DB-generated serial/identity column.
- Every tenant-scoped model has `tenantId String` with
  `@relation(fields: [tenantId], references: [id], onDelete: Cascade)`.
- Soft delete via nullable `deletedAt DateTime?` — never a hard delete
  for anything with operational/financial history.
- Money: always `Int` in integer minor currency units, paired with a
  `String @db.VarChar(3)` ISO 4217 currency code. Never `Float`, never
  `Decimal`.
- Percentages/rates: integer basis points (`taxRateBp`, discount
  `discountValue` when `discountType=PERCENTAGE`), e.g. `1000` = 10.00%.
- Append-only history tables (`*StatusHistory`) — never updated, only
  inserted, written inside the same transaction as the status change
  they record.
- `@@map("snake_case_table_name")` on every model (Prisma model names are
  PascalCase, actual table names are snake_case).

Migrations are generated non-interactively in this environment via
`prisma migrate diff --from-url ... --to-schema-datamodel ... --script`
(an `npx prisma migrate dev` prompt cannot run non-interactively here),
then hand-placed into a timestamped migration folder and applied with
`prisma migrate deploy`. See "Migration workflow" below for the exact
commands.

## Authentication flow

Email/password registration creates a `User` + a new `Tenant` + an
`OWNER` `TenantMembership` atomically in one transaction (rollback
verified by a dedicated test, `auth-rollback.e2e-spec.ts`). Login issues
a short-lived JWT access token + a longer-lived rotating refresh token,
both in `httpOnly` cookies (`rentos_access_token`, `rentos_refresh_token`)
— **never `localStorage`**. Refresh rotates the token (old one revoked,
new one issued). See [ADR 0001](adr/0001-authentication-and-tenant-context.md).

## Tenant isolation approach

Every tenant-scoped controller route is `/tenants/:tenantId/...` and
carries `@UseGuards(TenantGuard, PermissionsGuard)`. `TenantGuard` reads
`:tenantId` from the URL, verifies the current user has an `ACTIVE`
`TenantMembership` in that exact tenant (a fresh DB query every request,
never cached/trusted from a JWT claim), and populates
`CurrentTenant()`/`CurrentUser()` for the handler. A tampered or
cross-tenant ID in the URL is rejected with `403`, verified by dedicated
e2e tests in every module (`rejects cross-tenant ... access`).

## RBAC / permissions approach

Six roles: `OWNER`, `ADMIN`, `MANAGER`, `ACCOUNTANT`, `TECHNICIAN`,
`VIEWER`. `apps/api/src/permissions/permission.ts` defines every granular
`Permission` string (`"<resource>.<verb>"`, e.g. `"rentals.reserve"`,
`"rental_settings.manage"`) and the default `ROLE_PERMISSIONS` map.
`PermissionsGuard` + `@RequirePermissions("some.permission")` on each
controller handler is the _only_ authorization mechanism — grep the
codebase for `MembershipRole ===` inside a controller and you should find
nothing. `apps/web/src/lib/permissions.ts` mirrors the exact same map for
UX purposes (hiding/disabling controls a user can't use) — it is
explicitly documented as **not** a security boundary; the API
independently re-checks every permission server-side regardless of what
the UI shows.

## Audit conventions

`AuditService.log({ tenantId, userId, action, entityType, entityId,
metadata? }, tx?)`. Action names are `"<entity>.<verb>"` (e.g.
`"rental.created"`, `"quote.status_changed"`,
`"rental_billing_settings.updated"`). Written inside the same
`$transaction` as the action it records wherever the action itself is
transactional. Metadata never contains secrets/tokens/password hashes —
grep any new audit call for accidental inclusion of a hashed token or
similar before merging.

## Localization architecture

`packages/localization/src/locales/<lang>/common.json`, one flat-ish
nested JSON per language, identical key structure verified across all
six languages for every module (`en`, `ru`, `uk`, `de`, `pl`, `es`).
`packages/localization/src/index.ts` exports `resources` (i18next
resource bundle) — **note**: this package must be rebuilt
(`pnpm --filter @rentos/localization build`) after editing any
`common.json`, both for the web app to pick up new keys in dev/test and
because `apps/api` (a plain Node ESM consumer, unlike the
webpack-bundled web app) requires the compiled `dist/locales` output and
`with { type: "json" }` import attributes on every JSON import (a real
bug hit and fixed during TASK-0007 — see ADR 0007's known-limitations
history if curious). Error messages in Zod schemas are **i18n key
strings**, not display text — form components translate them via
`t(errors.field.message)`.

## Date and timezone conventions

All calendar-month arithmetic uses UTC fields explicitly
(`date.getUTCMonth()`, `Date.UTC(...)`) — **never** the host process's
local timezone. Adding N calendar months clamps the day-of-month to the
target month's actual length (Jan 31 + 1 month = Feb 28 or 29; Aug 31 + 1
month = Sep 30). A rental/quote's `plannedEnd` must be strictly after
`plannedStart` (validated server-side); durations round up any partial
day to a full billable day (`durationInDays`, never returns 0 for a valid
range). See [ADR 0008](adr/0008-configurable-monthly-billing-strategies.md)
for the full date-boundary convention.

## Money and minor-unit conventions

Every amount is an integer in minor currency units (cents), paired with
an ISO 4217 currency code. Percentages are integer basis points. Exactly
one `Math.round()` per computation step, never chained. No `Decimal`
library is used anywhere in this codebase — deliberately; see ADR 0002's
and ADR 0007's "decimal-safe arithmetic" sections for why integer
arithmetic was chosen over a Decimal type.

## Pricing architecture

`apps/api/src/rentals/rental-pricing.util.ts` is the canonical pricing
engine: `durationInDays`, `addCalendarMonthsUtc`, `monthsInRange` (legacy
whole-month rounding, still used as-is by Quotes' non-tenant-configurable
callers where applicable), `computeMonthlyBreakdown` (the
strategy-based complete-units-plus-remainder split — see below),
`computeItemLineTotalMinor`, `computeRentalTotals`. Quotes' own
`apps/api/src/quotes/quote-pricing.util.ts` imports the shared date/month
primitives from this file rather than reimplementing them — **this is
the established pattern for any future module that needs duration- or
calendar-month-based pricing**: extend `rental-pricing.util.ts`, import
from it, do not fork it.

## Monthly billing strategies

Three tenant-configurable strategies for `MONTHLY`-billed line items
(Rentals and, after this stabilization task, Quotes — both read the same
tenant-wide setting):

- `CALENDAR_MONTH` (default) — real calendar-month arithmetic; a period
  splits into complete calendar months plus a daily-priced remainder
  (e.g. Jan 15 → Mar 20 = 2 months + 5 days).
- `FIXED_30_DAYS` — every complete 30 billable days is one unit.
- `CUSTOM` — every complete tenant-defined `customMonthLengthDays`
  (1–365) billable days is one unit.

Configured per tenant via `RentalBillingSettings` (one optional row per
tenant — a missing row means the tenant has never customized this and
defaults to `CALENDAR_MONTH`, so no data migration was needed when this
model was introduced). Exposed via
`GET/PATCH /tenants/:tenantId/rental-billing-settings`, gated by
`rental_settings.view`/`rental_settings.manage`. See
[ADR 0008](adr/0008-configurable-monthly-billing-strategies.md).

## Historical-price snapshot rules

A `MONTHLY`-billed line item (on a Rental or a Quote) **freezes** the
strategy it was priced under at write time (`monthlyBillingStrategy` +
`customMonthLengthDays`, stored on the item row itself, nullable/null
unless the item is `MONTHLY`). A later change to the tenant's
`RentalBillingSettings` **never** alters an already-created item's stored
total — the frozen fields, combined with the parent Rental/Quote's own
`plannedStart`/`plannedEnd`, are enough to reproduce the exact original
calculation on demand via the same pure `computeMonthlyBreakdown`
function. Only an _explicit_ full item-list replacement (the user
resubmitting `items` on a `PATCH`) re-reads the tenant's _current_
settings; an edit that leaves items untouched (e.g. just `notes` or
`discountMinor`) always keeps every item's already-frozen strategy.

## Rental lifecycle

`DRAFT → QUOTE → RESERVED → ACTIVE → RETURNED → COMPLETED`, with
`CANCELLED` reachable from any non-terminal state. Items and planned
dates are editable only in `DRAFT`/`QUOTE`; immutable once `RESERVED`.
Every transition writes a `RentalStatusHistory` row in the same
transaction as the status change. The availability engine
(`AvailabilityService`) queries `RentalItem` rows whose parent
`Rental.status` is `RESERVED` or `ACTIVE` directly — never a cached
status field — using a half-open interval overlap check (back-to-back
same-day bookings allowed). See
[ADR 0006](adr/0006-rental-lifecycle-and-availability.md).

## Quote lifecycle

`DRAFT → SENT → VIEWED → ACCEPTED → CONVERTED`, with
`REJECTED`/`EXPIRED` reachable from `SENT`/`VIEWED` and `CANCELLED`
reachable from `DRAFT`/`SENT`. Commercial fields (customer, dates,
currency, discount, items) are editable only while `DRAFT` — once `SENT`
or later, duplicate the quote instead of mutating it (no revision-chain
model; see ADR 0007). Expiry is evaluated lazily (on next read/action
against a `SENT`/`VIEWED` quote past `validUntil`), not via a scheduled
job. Conversion to a Rental is idempotent (repeat calls on an
already-`CONVERTED` quote return the same Rental) and copies only
`ASSET`-type `QuoteItem`s into `RentalItem` rows; the Rental's totals are
copied verbatim from the Quote's own authoritative totals, never
recomputed from just the asset items.

## Document Management Platform (TASK-0008 Parts 1–2)

`apps/api/src/documents/` — a generic `Document` model (tagged by
`DocumentType`: `CONTRACT`/`HANDOVER_PROTOCOL`/`RETURN_PROTOCOL`/
`DAMAGE_REPORT`/`CONTRACT_AMENDMENT`/`CUSTOM`, plus a reserved, unused
`QUOTE` value) covering every document type with no type-specific
columns — type-specific content lives entirely in untyped JSON
(`DocumentVersion.businessDataSnapshot`, `DocumentItem.dataJson`). See
[ADR 0010](adr/0010-document-management-platform.md) (Part 1) and
[ADR 0011](adr/0011-document-rendering-and-sharing.md) (Part 2) for the
full rationale; this section is the short practical summary.

**Versioning/immutability**: a `DocumentVersion` is mutable only while its
document is `DRAFT`; leaving `DRAFT` (`POST .../ready`) finalizes it
forever (`isFinal`, `finalizedAt`). A later correction
(`POST .../versions`, `reason` required) creates a new parent-linked
version and resets the document to `DRAFT`. This is genuinely new
architecture in this codebase — Rentals/Quotes only freeze pricing at the
_item_ level (ADR 0008/0009), never the whole record.

**Lifecycle**: `DRAFT → READY → SENT → (VIEWED →)
PARTIALLY_SIGNED/SIGNED/REJECTED → ARCHIVED`, `VOIDED` from any
non-terminal state. `VIEWED` is optional, not a mandatory gate before
signing/rejecting. No real e-signature integration exists —
`sign`/`reject`/`viewed` only record a staff-asserted outcome, same
"logging placeholder now, real provider later" shape as `EmailProvider`.

**Numbering**: `document-numbering.util.ts` mirrors
`quote-numbering.util.ts`/`rental-numbering.util.ts`'s atomic upsert
exactly — one counter per `(tenantId, documentType, year)`, non-year-
scoped for named types (`CON-######`, `HD-######`, `RT-######`,
`DMG-######`, `AMD-######`), year-scoped only for `CUSTOM`
(`DOC-2026-######`). `year` uses a `0` sentinel, never `NULL`, for
non-year-scoped types — see D-024 in DECISIONS.md for why.

**Storage**: `DocumentFile` reuses `StorageService` as-is (ADR 0005) —
no new storage code. `format` is `PDF`/`HTML`/`JSON_SNAPSHOT` (reserved,
nothing generates these yet) or `ATTACHMENT`/`PHOTO` (staff-uploaded,
`POST .../:id/files`, mirrors `AssetFilesController`'s multipart pattern).

**Templates/rendering (Part 2)**: `apps/api/src/documents/rendering/` —
`VariableResolverService` builds a nested context (company/customer/
employee/asset/rental/quote/today/signature/notes/document/data) that
`resolveVariables()` substitutes into `{{dot.path}}` placeholders
(HTML-escaped, no whitelist). `DocumentRendererService.renderHtml()` is
computed live every call — never persisted. `PdfRendererService` wraps a
reused headless Chromium instance (Puppeteer — a scoped exception to ADR
0007's "no headless browser," `QuotePdfService`'s `pdfkit` pipeline is
untouched); `DocumentPdfService` stores the PDF output as a `DocumentFile`.
`DocumentTemplatesService` (`apps/api/src/documents/document-templates.
service.ts`) manages versioned templates, one `ACTIVE` per
`(tenant, documentType)`.

**Sharing/email/e-signature (Part 2)**: `apps/api/src/documents/sharing/`
(`DocumentSharingService` + `PublicDocumentsController`, both public
routes `POST` not `GET` since a password travels in the body),
`apps/api/src/documents/email/` (`DocumentEmailService`, synchronous send,
durable `DocumentEmailDelivery` rows, `dispatch()` is the future-queue
seam), `apps/api/src/documents/signature/` (`DOCUMENT_SIGNATURE_PROVIDER`
DI token, `LocalMockSignatureProvider` only — third instance of the
swappable-adapter pattern after `StorageAdapter`/`EmailProvider`).
`DocumentSignatureRequest.status` is deliberately not auto-synced to
`Document.status`; staff confirm outcomes via the existing `sign()`/
`reject()` actions.

**Frontend (Part 2)**: `apps/web/src/app/app/documents/**` (list/detail/
preview, template registry/editor) and `apps/web/src/app/share/[token]`
(public, no login) — full UI now exists; there is no document "edit" page
by design (see ADR 0011).

**Still not built**: real e-signature provider integration (DocuSign/Adobe
Sign/Autenti/eIDAS are named but not implemented — only the seam and a
local mock provider exist), and the existing `Quote` module is still not
migrated/duplicated into `Document` rows (see D-021 in DECISIONS.md).

## Customer Portal (TASK-0009)

`apps/api/src/customer-portal/` — see [ADR 0012](adr/0012-customer-portal.md)
for full rationale; this section is the short practical summary.

**Auth is fully separate from staff auth**: its own `JwtModule` bound to
`JWT_CUSTOMER_ACCESS_SECRET` (distinct from `JWT_ACCESS_SECRET`), its own
cookie pair (`rentos_portal_access_token`/`rentos_portal_refresh_token`),
its own `CustomerAuthGuard`/`CustomerTokenService`. Never imports
`AuthModule`. A portal session cannot satisfy a staff route, and vice
versa — verified by a dedicated e2e test. Login is
`tenantSlug + email + password` (`Customer.email` isn't unique per
tenant); a partial unique index enforces at most one activated portal
account per `(tenant, email)`. `PrismaService` globally `omit`s
`portalPasswordHash`/`portalInvitationTokenHash` from every query by
default.

**Every portal service is an ownership-checking wrapper**, never a fork:
`PortalRentalsService`/`PortalDocumentsService`/`PortalAssetsService`/etc.
each wrap the equivalent staff-facing service and add a
`resource.customerId === customerId` check, returning 404 (never 403) on
mismatch. No pricing/availability/rendering/signature logic is duplicated
anywhere in this tree.

**New capability added to an existing service**: `RentalsService
.extendPlannedEnd()` — the only new business-logic method this task added
outside `customer-portal/`, because `update()`'s existing
`EDITABLE_STATUSES` guard structurally cannot touch `plannedEnd` for a
RESERVED/ACTIVE rental. Portal extension-request approval calls this
method; nothing in the portal reimplements pricing or availability logic.

**Damage reports are their own model** (`RentalDamageReport` +
`RentalDamageReportPhoto`), not a `Document` row — `Document
.createdByUserId` has no customer-actor path. `convertToDocument()` is
staff-initiated and creates a real `DAMAGE_REPORT` document.

**Signature/status sync**: unlike ADR 0011's staff-side signature flow
(deliberately not auto-synced to `Document.status`), a customer's own
authenticated portal sign click via `DocumentSignatureService
.customerSign()` **does** advance `Document.status` — the customer's own
click is the confirmation, with no webhook-verification gap.

**Scope boundaries** (all deliberate, see ADR 0012): notifications are
in-app only, no email/push; ZIP bundling of a rental's documents is fully
in-memory (`archiver`, no streaming — `StorageService` has none); the
asset QR code links to the authenticated portal rental page, not a new
public unauthenticated endpoint.

**Frontend**: `apps/web/src/app/portal/**` — `portal/login`,
`portal/invite/[token]` (public), `portal/(shell)/**` (dashboard, rentals

- detail, calendar, documents + detail, messages, notifications, asset
  detail), gated by its own `usePortalMe()` check. Staff-side management
  (`CustomerPortalPanel`) is embedded on the existing customer detail page,
  gated by the new `customers.portal.manage` permission.

**Havelio rebrand**: every visible UI string, page title, browser tab
title, email template, and generated-document footer now reads "Havelio"
instead of "RentOS." Internal package/module names and cookie names are
unchanged for now.

**Still not built**: portal notification emails/push (in-app only today),
a real subdomain-per-tenant deployment (`tenantSlug` is collected via a
form field on login, not resolved from the URL), and a full "message
read" UI badge on the staff side beyond the panel itself.

## Important API conventions

- Every list endpoint returns `{ items, total, page, pageSize }`.
- Every create/update DTO uses `class-validator` decorators; cross-field
  rules (e.g. "the field matching `billingMode` is required") are
  enforced in the service layer's pricing utility, not the DTO.
- `404` for "not found, wrong tenant, or soft-deleted" — never leak
  whether a record exists in another tenant.
- `403` for a valid resource in a tenant the caller isn't a member of, or
  lacking the required permission.
- `409 Conflict` for a valid-but-currently-disallowed state transition
  (e.g. editing items on a non-`DRAFT` rental).
- Server-computed monetary/derived fields (`subtotalMinor`,
  `totalMinor`, snapshot fields) are always present in the response —
  the client never computes these itself for anything it submits.

## Important frontend conventions

- `apiClient.get/post/patch/delete` always send `credentials: "include"`.
- `ApiError` carries the raw backend message; `apiErrorMessage(error,
fallback)` shows it directly for modules with many distinct,
  human-readable validation/conflict messages (Assets, Rentals, Quotes);
  `apiErrorKey(error)` maps to a translation key for auth's smaller,
  enumerable error set.
- Every settings/detail page gates mutating controls behind
  `usePermission("some.permission")` — a UX convenience, always paired
  with the real server-side check.
- `window.confirm(...)` is still used for destructive-action
  confirmation (delete, cancel) — no custom confirmation dialog
  component exists yet.

## Testing strategy

- **Unit tests** (`*.spec.ts` next to the source, Vitest): pure pricing/
  numbering/validation functions, one file per util.
- **Backend e2e tests** (`apps/api/test/*.e2e-spec.ts`, Vitest +
  Supertest, real Postgres via `.env.test` → `rentos_test` database):
  full HTTP-request-level coverage per module — CRUD, tenant isolation,
  permission matrix per role, lifecycle transitions, audit log
  assertions. `cleanDatabase()` (`apps/api/test/db.util.ts`) truncates in
  FK-safe dependency order before every test.
- **Frontend component tests** (`apps/web/test/**/*.test.tsx`, Vitest +
  Testing Library): wizards, detail/list pages, settings pages — hooks
  mocked via `vi.mock`, rendered through `renderWithProviders` (wraps
  `QueryClientProvider` + `I18nextProvider`).
- Every task that touches pricing/numbering has added a concurrency or
  boundary-condition test alongside the happy-path ones (leap years,
  end-of-month, timezone safety, invalid custom values).

## Docker workflow

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d --build
# apply migrations inside the running api container:
docker compose --env-file .env -f docker/docker-compose.yml exec -T api \
  sh -lc "cd /app/apps/api && node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma"
docker compose --env-file .env -f docker/docker-compose.yml down
```

For local (non-Docker) backend development, only `postgres`/`redis` need
to run in Docker; `pnpm dev` runs the API/web processes on the host:

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d postgres redis
```

## Migration workflow

Non-interactive migration generation (this environment cannot run the
interactive `prisma migrate dev` prompt):

```bash
cd apps/api
DATABASE_URL="postgresql://rentos:rentos@localhost:5432/rentos_test?schema=public" \
  npx prisma migrate diff \
    --from-url "postgresql://rentos:rentos@localhost:5432/rentos_test?schema=public" \
    --to-schema-datamodel prisma/schema.prisma \
    --script > /tmp/migration_step.sql
mkdir -p "prisma/migrations/$(date -u +%Y%m%d%H%M%S)_<name>"
# copy the cleaned SQL (strip prisma's update-available banner) into migration.sql
DATABASE_URL="...rentos_test..." npx prisma migrate deploy
DATABASE_URL="...rentos..."      npx prisma migrate deploy   # also apply to the local dev DB
```

Always apply to **both** `rentos` (dev) and `rentos_test` (used by
`apps/api/test/*.e2e-spec.ts`) databases locally before running the full
test suite.

## CI workflow

`.github/workflows/ci.yml`: runs on push/PR to `main`, spins up a real
`postgres:17-alpine` service container, then `pnpm install
--frozen-lockfile` → `format:check` → `lint` → `typecheck` → apply test
DB migrations → `test` → `build`, in that order, all against the same
job. A red step anywhere fails the whole run — there is no
partial-success state to rely on.

## Known limitations (as of the last verified commit above)

- Public quote page and the generated PDF don't render the itemized
  monthly-billing breakdown (only the authenticated wizard/detail page
  do) — the underlying data is already in the API response, so this is
  additive UI work, not a data gap. See
  [ADR 0009](adr/0009-shared-monthly-pricing-and-atomic-rental-numbering.md).
- Public quote page doesn't show the tenant's company name (PDF does).
- No production email provider is wired in (`LoggingEmailProvider` only).
- No localization-key-parity lint check (verified manually per task).
- Document Management Platform (TASK-0008, both parts now complete) has
  no real e-signature provider integration — only the swappable seam and
  a `LocalMockSignatureProvider` exist; DocuSign/Adobe Sign/Autenti/eIDAS
  are named in the enum but not implemented. See
  [ADR 0011](adr/0011-document-rendering-and-sharing.md).
- The existing `Quote` module is still not migrated/duplicated into the
  generic `Document` model — a deliberate, documented scope boundary (see
  D-021 in DECISIONS.md), not an oversight.
- No document "edit" page exists in the frontend by design — editing isn't
  in Part 7's required action set, and document content is normally
  populated by the originating workflow (rental/quote conversion), not
  hand-typed by staff.
- Customer Portal (TASK-0009) has no email/push notification channel —
  `CustomerNotification` is in-app only; a customer must visit the portal
  to see an update. See [ADR 0012](adr/0012-customer-portal.md).
- Portal login collects `tenantSlug` as a form field rather than resolving
  it from a subdomain — no subdomain-per-tenant deployment exists yet.
- Internal package/module names and cookie names still say "RentOS" —
  only user-visible strings were rebranded to "Havelio" (deliberate, see
  ADR 0012 decision 10).

Resolved by the pre-TASK-0008 stabilization task (see
[ADR 0009](adr/0009-shared-monthly-pricing-and-atomic-rental-numbering.md)):
Quotes' `MONTHLY` pricing now shares Rentals' tenant-configurable
strategy engine instead of the old whole-month rounding, and
`generateRentalNumber`'s count-then-check race has been replaced with an
atomic, tenant-scoped Postgres sequence.

## Technical debt

See [ROADMAP.md](ROADMAP.md)'s "Technical debt" table for the full,
maintained list.

## Next recommended task

TASK-0009 (Customer Portal + Havelio rebrand) is complete, and a
governance/roadmap task (PRE-TASK-0010 — architecture lock + roadmap
alignment, no product code changed) has since landed on top of it —
see [`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md) and this file's
"Latest verified state" above for the exact commit.

**TASK-0010 (Complete UI/UX Redesign) is the next major task** — see
[ROADMAP.md](ROADMAP.md#task-0010--complete-uiux-redesign) for its full
scope. Do not start it in the same session/branch as this governance
task unless explicitly instructed to. The agreed sequence after
TASK-0010 is TASK-0011 (SaaS plans/subscription billing) through
TASK-0020 (AI assistant/workflow automation) — see
[ROADMAP.md](ROADMAP.md#planned-major-tasks-task-0010-onward) for the
full list and each task's scope. Read
[`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md) before starting any of
them.

## Important commands

```bash
pnpm install                 # from repo root, once
pnpm format:check            # prettier --check .
pnpm lint                    # turbo run lint (eslint per package)
pnpm typecheck                # turbo run typecheck
pnpm test                    # turbo run test (vitest, all packages)
pnpm build                   # turbo run build

# api-specific (run from apps/api, or via pnpm --filter @rentos/api <script>)
npx prisma generate
npx prisma migrate deploy
npx vitest run test/<name>.e2e-spec.ts   # one e2e file
npx vitest run src/<domain>/<file>.spec.ts  # one unit-test file
```
