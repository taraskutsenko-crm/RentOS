# Architecture Notes — Authentication & Tenancy

See [ADR 0001](adr/0001-authentication-and-tenant-context.md) for _why_
these choices were made. This document is the practical "how it works"
reference.

## Authentication flow

```
1. POST /auth/register (or /auth/login)
   → API creates/verifies the user, argon2id-verifies the password
   → API signs a JWT access token (15 min) and generates a random
     refresh token, hashing the refresh token (SHA-256) before storing it
   → API responds 200/201 and sets 3 httpOnly cookies:
       rentos_access_token, rentos_refresh_token, rentos_tenant_id (register only)

2. Every subsequent request to a protected route
   → Browser automatically attaches cookies (credentials: 'include')
   → JwtAuthGuard (global) verifies the access token signature/expiry,
     re-fetches the user from the DB, rejects if inactive/deleted
   → request.user is populated for @CurrentUser()

3. Access token expires (~15 min)
   → Client calls POST /auth/refresh (no access token needed —
     authenticates via the refresh token cookie instead)
   → API hashes the presented token, looks it up, checks not
     revoked/expired, then in one transaction: revokes it and issues a
     new refresh token + new access token (rotation)
   → Reusing the old (now-revoked) refresh token → 401

4. POST /auth/logout
   → API revokes the presented refresh token, clears all 3 cookies
```

## Tenant resolution

A user can belong to multiple tenants. The _active_ tenant is not part of
the access token — it's resolved per-request:

```
TenantGuard (applied explicitly on tenant-scoped routes):
  1. Read tenantId from the :tenantId route param, or fall back to the
     rentos_tenant_id cookie
  2. Query TenantMembership WHERE tenantId = ? AND userId = <current user>
     AND status = 'ACTIVE'
     → not found → 403 Forbidden
  3. Query Tenant WHERE id = tenantId AND deletedAt IS NULL AND isActive
     → not found → 403 Forbidden
  4. Attach { tenant, membership } to the request for @CurrentTenant()
```

This runs on **every** tenant-scoped request — a suspended membership or a
deleted tenant loses access immediately, without waiting for any token to
expire, and a tampered `tenantId` (route param or cookie) is always
rejected unless a real `ACTIVE` membership row backs it.

## RBAC

`TenantMembership.role` is one of `OWNER | ADMIN | MANAGER | ACCOUNTANT |
TECHNICIAN | VIEWER`. Routes opt into a role check with `@Roles(...)`;
`RolesGuard` (global, no-op without `@Roles`) reads
`request.tenant.membership.role` — which requires `TenantGuard` to have
run first on that route. The tenant creator's initial membership role is
always `OWNER`.

No endpoint introduced in this task currently restricts by role (there's
nothing in scope that needs it yet) — this is a ready extension point for
future business endpoints, e.g. `@Roles('OWNER', 'ADMIN')` on a future
"invite member" endpoint.

## Cookie security

| Attribute  | Value                                                         |
| ---------- | ------------------------------------------------------------- |
| `httpOnly` | always — never readable by JavaScript                         |
| `secure`   | `NODE_ENV === 'production'`                                   |
| `sameSite` | `lax`                                                         |
| `domain`   | unset in dev (host-only); `COOKIE_DOMAIN` in production       |
| `path`     | `/` for access token & tenant hint; `/auth` for refresh token |

## Local development commands

```bash
# Start Postgres + Redis
docker compose --env-file .env -f docker/docker-compose.yml up -d postgres redis

# Apply migrations
pnpm --filter @rentos/api prisma:deploy

# Run API + web in dev mode (from repo root)
pnpm dev

# Run the backend integration test suite (real Postgres, real crypto)
pnpm --filter @rentos/api test

# Run the frontend component test suite
pnpm --filter @rentos/web test
```

## Required environment variables

See [`.env.example`](../.env.example) at the repo root for the full,
current list with defaults. The auth-specific ones:

| Variable                     | Purpose                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `WEB_ORIGIN`                 | Exact origin allowed to call the API with credentials (CORS)                                                        |
| `JWT_ACCESS_SECRET`          | HMAC secret for signing staff access tokens (≥32 chars)                                                             |
| `JWT_CUSTOMER_ACCESS_SECRET` | HMAC secret for signing customer portal access tokens (≥32 chars) — distinct from `JWT_ACCESS_SECRET`, see ADR 0012 |
| `ACCESS_TOKEN_TTL_SECONDS`   | Access token lifetime (default 900 = 15 min)                                                                        |
| `REFRESH_TOKEN_TTL_DAYS`     | Refresh token lifetime (default 30)                                                                                 |
| `COOKIE_DOMAIN`              | Optional; set in production to share cookies across subdomains                                                      |

### Asset file storage

| Variable            | Purpose                                                                          |
| ------------------- | -------------------------------------------------------------------------------- |
| `STORAGE_LOCAL_DIR` | Root directory for the local-filesystem storage adapter (asset images/documents) |

Only a local-filesystem `StorageAdapter` is implemented today — see
[ADR 0005](adr/0005-asset-file-storage-strategy.md) for the S3-compatible
interface it satisfies and how a production adapter would be swapped in.

## Assets module

See [ADR 0002](adr/0002-universal-asset-model.md) through
[ADR 0005](adr/0005-asset-file-storage-strategy.md) for the full design
rationale. This section is the practical "how it works" reference,
mirroring the style of the Authentication & Tenancy sections above.

### Domain model

```
AssetCategory (tenant-scoped, nested via parentId)
  └─ Asset (categoryId, currentStatusId, money in minor units, universal fields only)
       ├─ AssetCustomFieldValue (assetId, fieldDefinitionId, valueJson)  — typed per AssetCustomFieldDefinition
       ├─ AssetStatusHistory (fromStatusId → toStatusId, append-only)
       ├─ AssetLocationHistory (previousLocation → newLocation, append-only, free text)
       ├─ AssetImage (storageKey, isPrimary, soft-deleted)
       └─ AssetDocument (storageKey, documentType, soft-deleted)

AssetStatusDefinition (tenant-scoped; 8 system rows seeded automatically + tenant-defined custom ones)
AssetCustomFieldDefinition (tenant-scoped; categoryId nullable = applies globally)
```

Every table above carries `tenantId` and every service method filters by
it directly in the Prisma `where` clause (never a post-fetch check) — the
same non-negotiable rule ADR 0001 established for Customers extends to
every asset table without exception.

### Custom field validation

`AssetCustomFieldDefinition.validationRules` is a small declarative shape
(`min`, `max`, `minLength`, `maxLength`, `pattern`) — never executable code.
`AssetFieldValuesService` resolves the applicable definitions for an
asset's category (global + category-specific), validates each submitted
value via `validateFieldValue` (one case per `AssetFieldType`), and
enforces that every `isRequired` definition ends up with a value after
merging the incoming payload over any existing stored values. See
[ADR 0003](adr/0003-custom-field-storage-strategy.md).

### Money storage

`purchasePriceMinor` / `replacementValueMinor` are integers in the
currency's minor unit (e.g. cents); `purchaseCurrency` /
`replacementCurrency` are validated ISO 4217 codes
(`packages/shared/src/currencies.ts`). A minor-units value and its
currency must always be set together (`AssetsService.assertMoneyPairing`).
The frontend never exposes raw minor units to a user — see
`apps/web/src/lib/money.ts` for the major-unit ↔ minor-unit conversion at
the form/display boundary.

### Status transitions

`POST /tenants/:tenantId/assets/:assetId/status` atomically (single
`$transaction`) updates `Asset.currentStatusId` and inserts an
`AssetStatusHistory` row recording `fromStatusId`, `toStatusId`,
`changedByUserId`, and an optional `reason`. An inactive status cannot be
assigned. System statuses (`isSystem = true`) can have every field edited
except `code`, and can never be deleted; a custom status cannot be deleted
while any active asset currently has it. See
[ADR 0004](adr/0004-configurable-asset-statuses.md).

### File upload flow

Images and documents are uploaded via direct `multipart/form-data` POSTs
(not a presigned-URL flow — see [ADR 0005](adr/0005-asset-file-storage-strategy.md)
for why), validated for MIME type and size
(`image/jpeg`/`image/png`/`image/webp` for images, plus `application/pdf`
for documents), and persisted through a small `StorageAdapter` interface
— `LocalFilesystemStorageAdapter` in every environment today, with a
production S3-compatible adapter as the documented next step. Reads go
through a protected, tenant-scoped streaming endpoint
(`GET .../images/:imageId/file`), not a raw/public URL. Deleting an image
or document soft-deletes the metadata row and then best-effort deletes the
underlying object from storage.

### Timeline event structure

`GET /tenants/:tenantId/assets/:assetId/timeline` returns a single,
chronologically-sorted (oldest first) array combining creation, updates
(from `AuditLog`), status changes, location changes, image uploads, and
document uploads:

```json
[
  {
    "id": "string",
    "type": "created | updated | status_changed | location_changed | image_uploaded | document_uploaded",
    "occurredAt": "ISO-8601 string",
    "actorUserId": "string | null",
    "data": { "...": "event-specific metadata" }
  }
]
```

### Permissions

See [`docs/api.md#permissions`](api.md#permissions) for the full
permission-to-role mapping. Authorization is granular
(`assets.read`, `assets.create`, …), enforced by a reusable
`PermissionsGuard` + `@RequirePermissions(...)` decorator
(`apps/api/src/permissions/`) applied after `TenantGuard` on every
asset-module controller — controllers never check `MembershipRole` names
directly.

## Rentals module

See [ADR 0006](adr/0006-rental-lifecycle-and-availability.md) for the full
design rationale. Routes live under `/tenants/:tenantId/rentals`,
consistent with every other business module (the master spec's flat
`/rentals` listing is treated as shorthand — see the ADR).

### Domain model

```
Customer
  └─ Rental (rentalNumber, status, plannedStart/End, actualStart/End, money in minor units)
       ├─ RentalItem[] (assetId, quantity, billingMode, per-mode price, deposit, discount, returnedAt)
       └─ RentalStatusHistory (fromStatus → toStatus, append-only)

Asset (from the Assets module) ← referenced by RentalItem.assetId, never asset-type-specific
```

### Lifecycle

```
DRAFT → QUOTE → RESERVED → ACTIVE → RETURNED → COMPLETED
  ↓       ↓         ↓         ↓
              CANCELLED (from DRAFT, QUOTE, RESERVED, or ACTIVE)
```

Items and planned dates are editable only in `DRAFT`/`QUOTE`; they become
immutable once `RESERVED`. Every transition is atomic (single
`$transaction`) with its `RentalStatusHistory` row and `AuditLog` entry.
`POST .../start` and `POST .../return` additionally sync the affected
assets' `currentStatusId` (`RENTED`/`AVAILABLE`) as a best-effort side
effect — never part of the availability guarantee itself (see below).

### Availability engine

`AvailabilityService` is the single source of truth for whether an asset
is free over a date range. It queries `RentalItem` rows whose parent
`Rental.status` is `RESERVED` or `ACTIVE` (the only two statuses that
represent a confirmed claim) and checks interval overlap using a
half-open window (`existingStart < requestedEnd && existingEnd >
requestedStart`) — so back-to-back same-day bookings are allowed. An item
returned early (`returnedAt` set via a partial return) stops blocking
immediately, even before the rental's overall planned end. The hard
availability check (`assertAvailable`, throws `409 Conflict` listing every
unavailable asset) runs exactly once, at `POST .../reserve` — drafts and
quotes never claim an asset.

### Pricing

`apps/api/src/rentals/rental-pricing.util.ts` computes each `RentalItem`'s
line total from its `billingMode` (`DAILY`/`WEEKLY` = unit price × periods
× quantity, minus the item discount; `CUSTOM` = a flat price, ignoring
duration and quantity), then sums into `Rental.subtotalMinor` and applies
the rental-level discount/tax to get `Rental.totalMinor` — always integer
minor units, recomputed and stored on every create/update. The frontend
wizard mirrors this formula (`apps/web/src/lib/rental-pricing.ts`) only
for live UI feedback; the API is always the source of truth.

`MONTHLY` billing is tenant-configurable — see
[ADR 0008](adr/0008-configurable-monthly-billing-strategies.md) for the
full design. `RentalBillingSettings` (one optional row per tenant,
defaulting to `CALENDAR_MONTH` when absent) picks one of three
strategies, and `computeMonthlyBreakdown` splits the item's period into
complete monthly units (billed at `monthlyPriceMinor`) plus a remainder
(billed at `dailyPriceMinor`, now required alongside `monthlyPriceMinor`
for every `MONTHLY` item):

- **CALENDAR_MONTH** (default) — real calendar-month arithmetic (UTC-only,
  leap-year and end-of-month safe, via `addCalendarMonthsUtc`): the
  largest number of whole calendar months that fit, plus the exact days
  left over (e.g. Jan 15 → Mar 20 = 2 months + 5 days). This differs from
  the plain `monthsInRange` helper (still used unchanged by Quotes, which
  has no tenant-configurable strategy — see ADR 0007) in that a partial
  month is billed daily instead of rounded up to a whole extra month.
- **FIXED_30_DAYS** — every complete 30 billable days is one unit;
  remainder in days.
- **CUSTOM** — every complete `customMonthLengthDays` (1-365, tenant-set)
  billable days is one unit; remainder in days.

Each `RentalItem` snapshots the `monthlyBillingStrategy`/
`customMonthLengthDays` it was priced under at write time (create, or a
full item replacement on update) — never re-derived from the tenant's
_current_ settings on read. This is what guarantees a later settings
change never silently alters an already-stored rental's total: only an
explicit item replacement (the user re-submitting `items` on `PATCH`)
reads the tenant's current settings again; an update that leaves items
untouched (e.g. just `notes` or `discountMinor`) keeps every item's
already-frozen strategy. `apps/api/src/rental-billing-settings/` exposes
this as its own small settings module (`GET`/`PATCH
/tenants/:tenantId/rental-billing-settings`, gated by
`rental_settings.view`/`rental_settings.manage`) rather than folding it
into `TenantsService`, since it's optional per-module configuration, not
core tenant identity.

### Timeline

`GET /tenants/:tenantId/rentals/:id/timeline` combines creation, updates,
status changes, and return events into one chronologically-sorted feed,
the same normalized shape as the Assets module's timeline.

## Quotes module

See [ADR 0007](adr/0007-quotes-and-commercial-offers.md) for the full
design rationale. This section is the practical "how it works" reference.

### Domain model

```
Quote (tenant-scoped, one Customer, one shared plannedStart/plannedEnd)
  ├─ QuoteItem[] (itemType ASSET|SERVICE|PRODUCT|FEE|DELIVERY|COLLECTION|LABOR|CUSTOM,
  │              assetId nullable, billingMode DAILY|WEEKLY|MONTHLY|CUSTOM|FLAT)
  ├─ QuoteStatusHistory (append-only, changedByUserId nullable for public actions)
  └─ QuoteDocument[] (one row per generated PDF; storageKey points into StorageService)

QuoteSequence (tenantId, year, lastNumber — backs concurrency-safe quoteNumber generation)

Rental.sourceQuoteId (nullable, unique) — set atomically when a Quote converts
```

Only `QuoteItem`s with `itemType = ASSET` may set `assetId`; every other
type must leave it null (enforced in `QuotesService`, not the database).

### Lifecycle

```
DRAFT → SENT → VIEWED → ACCEPTED → CONVERTED
  ↓       ↓        ↓
        REJECTED / EXPIRED (from SENT or VIEWED)
  ↓       ↓
       CANCELLED (from DRAFT or SENT)
```

Every transition writes a `QuoteStatusHistory` row (single `$transaction`
with the status change itself) and an `AuditLog` entry. `EXPIRED` has no
scheduled sweep job — it's evaluated lazily, on the next read or action
against a `SENT`/`VIEWED` quote whose `validUntil` has passed, transitioning
it before continuing; the transition itself is still fully recorded, so
historical status remains auditable even though expiry wasn't "noticed"
until the next access. Commercial fields (`customerId`, dates, `currency`,
discount, `items`) can only be edited while `DRAFT` — once `SENT` or
later, duplicate the quote instead of mutating it (see ADR 0007's
revisions section). `customerNotes`/`internalNotes`/`termsAndConditions`
remain editable at any status; `validUntil` remains editable until the
quote reaches a terminal status.

### Numbering

`Q-<year>-######`, generated by `quote-numbering.util.ts`'s atomic
Postgres `INSERT ... ON CONFLICT (tenantId, year) DO UPDATE SET
lastNumber = lastNumber + 1 RETURNING lastNumber` against the
`QuoteSequence` table — genuinely concurrency-safe (unlike the existing
`generateRentalNumber`, left as-is; see ADR 0007). The counter never
decrements, so a cancelled or deleted quote's number is never reused.

### Pricing

`apps/api/src/quotes/quote-pricing.util.ts` reuses `durationInDays` from
`rental-pricing.util.ts` unchanged for `DAILY`/`WEEKLY` items, adding a
`FLAT` branch (`unitPriceMinor × quantity`, no duration factor) for
non-time-based lines. Discounts/tax are integer basis points
(`discountValue` when `discountType=PERCENTAGE`, `taxRateBp`), resolved
with exactly one `Math.round` per line — see ADR 0007's
decimal-safe-arithmetic section. Each item's `lineTotalMinor` already
nets its own discount and tax; the Quote's `subtotalMinor` sums those,
then the quote-level discount applies as one more flat layer on top
(mirroring `Rental.discountMinor`). `taxTotalMinor`/`depositTotalMinor`
on the Quote are display aggregates only — already folded into
`subtotalMinor`/excluded from `totalMinor` respectively, never
double-counted.

`MONTHLY` items share Rentals' own tenant-configurable strategy engine
exactly (`computeMonthlyBreakdown` — see the Rentals module's "Pricing"
section above and
[ADR 0009](adr/0009-shared-monthly-pricing-and-atomic-rental-numbering.md)),
rather than a separate Quotes-specific calculation: `QuoteItem` gets the
same `monthlyBillingStrategy`/`customMonthLengthDays` snapshot columns
`RentalItem` has, `QuotesService` reads the same
`RentalBillingSettings` Rentals reads, and a `MONTHLY` item requires
both `monthlyPriceMinor` and `dailyPriceMinor` under the new engine. A
`QuoteItem` written before this existed (`monthlyBillingStrategy` is
`null`) falls back to the original `monthsInRange`-based whole-month
rounding it was actually priced under, reproducing its historical total
exactly rather than silently recalculating it — see ADR 0009 for why
this matters and why it's the item's _absence_ of a strategy that
selects this fallback, not a default strategy value. Quote-to-rental
conversion carries each `ASSET` item's frozen snapshot onto the
resulting `RentalItem` verbatim; duplication does the same.

### Asset availability

Quotes never reserve anything — `AvailabilityService` (unchanged from
Rentals) is reused for two distinct checks:

- **Save-time** (`create`/`update`/`findOne`): a non-throwing
  `checkAvailability(...)` call for every `ASSET` item, surfaced as
  `availabilityWarnings` in the response — never blocks saving.
- **Convert-time** (`convertToRental`): the hard `assertAvailable(...)`
  check, called once, before the conversion transaction opens (the same
  pre-transaction placement `RentalsService.reserve()` already uses).

### Quote-to-Rental conversion

Only an `ACCEPTED` quote may be converted, inside one transaction:
revalidate the customer and every `ASSET` item's asset, re-check
availability, create a `RESERVED` `Rental` (totals copied verbatim from
the Quote, not recomputed — see ADR 0007), create `RentalItem` rows for
`ASSET` items only, write both a `RentalStatusHistory` and
`QuoteStatusHistory` row, and mark the Quote `CONVERTED`. Idempotent:
converting an already-`CONVERTED` quote returns the existing linked
Rental (via `Rental.sourceQuoteId`) rather than erroring or creating a
duplicate.

### PDF generation

`QuotePdfService` renders via `pdfkit` with an embedded Unicode font
(`dejavu-fonts-ttf`, covering Cyrillic and Latin-Extended so `ru`/`uk`/
`de`/`pl` quotes render correctly — the built-in Helvetica/Times/Courier
fonts only cover Latin-1). PDF labels are resolved from
`@rentos/localization`'s shared `quote.pdf.*` resources for the tenant's
`defaultLanguage`, so the backend never duplicates translated strings.
Output is stored via the existing `StorageService` (ADR 0005, unmodified)
under `tenants/:tenantId/quotes/:quoteId/pdf/...`; a `QuoteDocument` row
is created per generation. `GET .../pdf` serves the most recent one
without regenerating; `POST .../pdf` forces a fresh document.

### Email

`apps/api/src/email/` mirrors the Storage module's swappable-adapter
pattern: an `EmailProvider` interface, an `EMAIL_PROVIDER` DI token, and
the default `LoggingEmailProvider`, which logs the message via Nest's
`Logger` and always reports success — it is not a working transport. Wire
a production provider (SMTP, SES, SendGrid, etc.) by implementing
`EmailProvider` and swapping `EmailModule`'s `{ provide: EMAIL_PROVIDER,
useClass: ... }` (or `useFactory` if it needs config/credentials from
`ConfigService`) — no caller of `EmailService` needs to change. Sending
happens only after the status-change transaction commits (never inside
it); a failed send is recorded via an audit log entry
(`quote.send_email_failed`) and reported honestly in the `send` response
(`{ quote, emailSent, emailError? }`) rather than a fabricated success.

### Public acceptance

`Quote.publicTokenHash` (SHA-256 of a `randomBytes(48)` token, the same
convention `RefreshToken` uses) + `publicTokenExpiresAt` are set on every
`send`, replacing any previous token. `/public/quotes/:token` (a
`@Public()`-marked controller, exempt from the global `JwtAuthGuard`, with
tightened `@Throttle()` limits) resolves purely by hashing the token —
no `tenantId` in the URL. The response (`PublicQuoteView`) is a hand-
picked subset that never includes `internalNotes`, `tenantId`, user ids,
or the token hash itself. Viewing, accepting, and rejecting are all
idempotent; acceptance is explicitly labeled "quote acceptance," with a
visible disclaimer that it is not a qualified electronic signature.

### Permissions

`quotes.view/create/update/delete/send/accept/reject/convert/duplicate/
download/manageTemplates`, enforced by the same `PermissionsGuard` +
`@RequirePermissions(...)` pattern as every other module.
`quotes.manageTemplates` is a reserved permission for a future PDF/email
template editor — no such feature exists yet. `quotes.accept`/
`quotes.reject` gate the staff-recorded endpoints only; the public
customer-facing accept/reject flow is gated by the token, not a role.

### Timeline

`GET /tenants/:tenantId/quotes/:id/history` combines creation, updates,
every status change, sends, views, acceptance/rejection, duplication,
conversion, and PDF generation into one chronologically-sorted feed, the
same normalized shape as the Assets/Rentals timelines.

### Known limitations

- The public quote page does not currently display the tenant's company
  name (only shown in the generated PDF) — a small, deliberately deferred
  enhancement; adding it means the public response builder needs to fetch
  `Tenant.name` alongside the quote.
- `LoggingEmailProvider` is the only implementation shipped — a
  production SMTP/SES/SendGrid provider must be added before quotes can
  actually be emailed to real customers (see "Email" above for how).
- The public quote page and the generated PDF do not render the itemized
  monthly breakdown (only the authenticated wizard and detail page do) —
  the underlying data is already in the public API response shape, so
  this is additive UI work, not a data gap (see ADR 0009).

Resolved by
[ADR 0009](adr/0009-shared-monthly-pricing-and-atomic-rental-numbering.md)
(no longer limitations): Quotes' `MONTHLY` pricing now shares Rentals'
configurable strategy engine instead of a fixed whole-month-rounding
rule, and `generateRentalNumber`'s count-then-check race has been
replaced with the same atomic sequence pattern `quote-numbering.util.ts`
already used.

## Document Management Platform (TASK-0008 Parts 1–2)

See [ADR 0010](adr/0010-document-management-platform.md) (Part 1: domain
model) and [ADR 0011](adr/0011-document-rendering-and-sharing.md) (Part 2:
templates, rendering, public sharing, email, e-signature foundation) for the
full design rationale.

### Domain model

```
Document (tenant-scoped; documentType CONTRACT|HANDOVER_PROTOCOL|RETURN_PROTOCOL|
          DAMAGE_REPORT|CONTRACT_AMENDMENT|CUSTOM|QUOTE[reserved, unused in Part 1];
          customerId/rentalId/quoteId/assetId/employeeUserId all nullable)
  ├─ DocumentVersion[] (versionNumber, parentVersionId, businessDataSnapshot JSON,
  │                     templateId nullable, isFinal, finalizedAt, reason)
  │     └─ DocumentFile[] (format PDF|HTML|JSON_SNAPSHOT|DOCX|XML|ATTACHMENT|PHOTO;
  │                        storageKey points into StorageService)
  ├─ DocumentItem[] (per-line/per-asset; assetId/rentalItemId nullable, dataJson JSON)
  └─ DocumentStatusHistory (append-only, changedByUserId nullable for future public actions)

DocumentTemplate (id/documentType/name/description/status DRAFT|ACTIVE|ARCHIVED/currentVersionNumber)
  └─ DocumentTemplateVersion[] (versionNumber, htmlContent, css, variablesSchema — immutable once created)
DocumentSequence (tenantId, documentType, year — backs concurrency-safe documentNumber generation)
DocumentShareLink (per DocumentVersion; tokenHash, passwordHash?, expiresAt, viewCount, downloadCount, disabledAt?)
DocumentEmailDelivery (per Document; recipientType, recipientEmail, subject, status, errorMessage?, sentAt?)
DocumentSignatureRequest (per Document; provider, status REQUESTED|PENDING|SIGNED|REJECTED|EXPIRED|CANCELLED)
```

`Document` holds no type-specific columns — every document type shares the
same schema; type-specific structured content lives entirely in
`businessDataSnapshot`/`dataJson`, the same "universal, not
industry-hardcoded" principle as `AssetCustomFieldValue.valueJson`.

### Lifecycle and finalization

```
DRAFT → READY → SENT → (VIEWED →) PARTIALLY_SIGNED/SIGNED/REJECTED → ARCHIVED
VOIDED reachable from every non-terminal state.
```

Version 1 is created alongside the `Document` and stays mutable while
`DRAFT` — `DocumentsService.update` edits its `businessDataSnapshot` in
place. The moment status leaves `DRAFT` (`markReady`), that version is
**finalized** (`isFinal = true`, `finalizedAt` set) and never edited
again. A later correction (`POST .../versions`, requires a `reason`)
creates a brand-new version with `parentVersionId` pointing at the one
being corrected, and resets the document to `DRAFT` so the correction can
itself be reviewed and finalized again. Every version, finalized or not,
is preserved forever. `VIEWED` is an optional intermediate, not a
mandatory gate — `SENT` can move directly to
`PARTIALLY_SIGNED`/`SIGNED`/`REJECTED` too (e.g. a wet-ink signature
recorded out-of-band).

### Numbering

Each business type gets its own flat, non-year-scoped counter —
`CON-######` (CONTRACT), `HD-######` (HANDOVER_PROTOCOL), `RT-######`
(RETURN_PROTOCOL), `DMG-######` (DAMAGE_REPORT), `AMD-######`
(CONTRACT_AMENDMENT) — matching the existing `RNT-######` convention.
`CUSTOM` is year-scoped (`DOC-<year>-######`, matching `QuoteSequence`'s
shape), since it is the catch-all bucket expected to accumulate the most
volume. `document-numbering.util.ts` mirrors
`quote-numbering.util.ts`/`rental-numbering.util.ts`'s atomic
`INSERT ... ON CONFLICT DO UPDATE ... RETURNING` upsert exactly —
verified race-free under 20 concurrent HTTP requests in
`test/documents.e2e-spec.ts`.

### Storage

`DocumentFile` reuses `StorageService` as-is (ADR 0005, unmodified) —
this platform is never tied to local-filesystem storage. `format`
distinguishes system-generated renderings (`PDF`/`HTML`/`JSON_SNAPSHOT` —
no generator exists yet in Part 1) from staff-uploaded supporting files
(`ATTACHMENT`/`PHOTO`, uploaded via `POST .../files`, mirroring
`AssetFilesController`'s multipart pattern exactly). `DOCX`/`XML` are
reserved enum values for documented future formats.

### Permissions

`documents.view/create/update/delete/send/sign/void/archive/download/
manageTemplates`. MANAGER gets full lifecycle control except `delete`/
`manageTemplates` (mirrors Quotes); TECHNICIAN gets
`view`/`create`/`update`/`download` (handover/return/damage-report
documents are within its physical-handling domain) but not
`send`/`sign`/`void`/`archive`; ACCOUNTANT/VIEWER get `view`+`download`
only.

### Timeline

`GET /tenants/:tenantId/documents/:id/history` combines creation, edits,
every status change, sends, views, signatures, downloads, archival, and
version creation into one chronologically-sorted feed, the same
normalized shape as Assets/Rentals/Quotes.

### Part 2: templates, rendering, public sharing, email, e-signature

See [ADR 0011](adr/0011-document-rendering-and-sharing.md) for full
rationale.

- **Templates** (`documents/document-templates.service.ts`) — versioned,
  one `ACTIVE` per `(tenant, documentType)` (transactional demotion +
  partial unique index). Template resolution at render time: explicit
  `DocumentVersion.templateId` → tenant's `ACTIVE` template for that type →
  built-in `DEFAULT_TEMPLATES` (never a DB row), so every document type
  renders correctly with zero tenant setup.
- **Rendering** (`documents/rendering/`) — `DocumentRendererService.
renderHtml()` resolves `{{dot.path}}` variables (company/customer/
  employee/asset/rental/quote/today/signature/notes/document/data) against
  a `VariableResolverService`-built context, HTML-escaping every
  substituted value. **HTML is never persisted** — always recomputed from
  the immutable `DocumentVersion` snapshot. `PdfRendererService` converts
  the resolved HTML to a PDF buffer via a reused headless Chromium instance
  (Puppeteer — a scoped exception to ADR 0007's "no headless browser" for
  Quotes; `QuotePdfService`'s `pdfkit` pipeline is untouched).
  `DocumentPdfService` stores the PDF as a new `DocumentFile` and caches it
  per version until a forced regeneration.
- **Public sharing** (`documents/sharing/`) — `DocumentShareLink` per
  version, opaque SHA-256-hashed token, optional argon2-hashed password, at
  most one active link per document (creating a new one disables the old
  one). Both `POST /public/documents/:token/view` and `.../pdf` are `POST`
  (password travels in the body, never a query string) — no `GET` variant.
  View/download counts, last-access IP, and disable/regenerate history are
  tracked; a public view also advances `Document.status` `SENT → VIEWED`
  the same way an authenticated `markViewed` does.
- **Email** (`documents/email/`) — `DocumentEmailDelivery` is a durable row
  per send attempt (not just an audit-log entry, unlike Quotes), reusing the
  existing `EmailProvider` abstraction (ADR 0007). Sending is synchronous in
  Part 2; `dispatch()` is the documented future-queue seam. Failed sends are
  retryable via `POST .../email/:id/retry`.
- **E-signature** (`documents/signature/`) — `DOCUMENT_SIGNATURE_PROVIDER`
  DI token (third instance of the swappable-adapter pattern, after
  `StorageAdapter` and `EmailProvider`), bound to `LocalMockSignatureProvider`
  only. `DocumentSignatureRequest`'s own status machine is deliberately
  **not** auto-synced to `Document.status` — no real provider/webhook exists
  yet, so staff confirm outcomes via the existing `sign()`/`reject()`
  actions.
- **Frontend** — full UI now exists: document list/detail/preview
  (`app/app/documents/**`), template registry/editor
  (`app/app/documents/templates/**`), and a standalone public share page
  (`app/share/[token]`, no login, handles the password-required flow).
  There is no document "edit" page — editing isn't in Part 7's required
  action set, and a document's content is normally populated by the
  originating workflow, not hand-typed.

### New `documents.*` permissions in Part 2

`documents.templates.view`, `documents.templates.manage`, `documents.render`,
`documents.share` were added alongside Part 1's set. MANAGER gets
`render`/`share`/`templates.view` but not `templates.manage`; TECHNICIAN gets
`render` only; ACCOUNTANT/VIEWER get `templates.view` (read-only) but not
`render`/`share`.

- Frontend UI (types, hooks, pages, localization) — backend architecture
  only, per the task's explicit scope.
- Migrating the existing `Quote` module into `Document` rows (see ADR
  0010's rationale for why `DocumentType.QUOTE` exists but is unused).

## Customer Portal (TASK-0009)

See [ADR 0012](adr/0012-customer-portal.md) for full design rationale,
including why the portal has its own, fully separate auth stack.

### Auth

A `Customer` who accepts a staff-generated invitation
(`POST /tenants/:tenantId/customers/:customerId/portal/invite`) sets a
password and gets a portal session — cookies `rentos_portal_access_token`
/ `rentos_portal_refresh_token`, signed with `JWT_CUSTOMER_ACCESS_SECRET`
(a secret distinct from staff's `JWT_ACCESS_SECRET`), verified by
`CustomerAuthGuard`, never by the staff `AuthGuard` or vice versa. Login is
`tenantSlug + email + password` (`Customer.email` is optional and not
unique per tenant, so email alone can't resolve an account). At most one
**activated** portal account may exist per `(tenant, email)` — enforced by
a partial unique index. `PrismaService` globally `omit`s
`portalPasswordHash`/`portalInvitationTokenHash` from every query by
default; only the portal auth service's own login/activation lookups opt
back in.

### Modules (`apps/api/src/customer-portal/`)

Every module below is a thin, ownership-checking wrapper around an
existing staff-facing service — no pricing, availability, rendering, or
signature logic is duplicated anywhere in this tree:

- **`auth/`** — `PortalAuthService` (login/activate/refresh/logout),
  `CustomerAuthGuard`, `CustomerTokenService`.
- **`invitations/`** — `CustomerPortalInvitationsService` (staff-side
  invite/revoke/status). `invite()` returns the plaintext `inviteLink`
  directly in its response, the same precedent `DocumentSharingService`
  already set for share tokens, since no real email provider is wired in
  yet.
- **`rentals/`** — `PortalRentalsService` wraps `RentalsService`;
  `PortalRentalListItem`/`PortalRentalDetail` omit `internalNotes`.
- **`documents/`** — `PortalDocumentsService` wraps `DocumentsService` +
  `DocumentRendererService` + `DocumentPdfService` +
  `DocumentSignatureService`. `sign()` delegates to
  `DocumentSignatureService.customerSign()`, the one place a customer's own
  authenticated signature click also advances `Document.status` (ADR
  0011's staff-side signature/status desync does not apply here — see ADR
  0012 decision 6). `zipRentalDocuments()` bundles every document's current
  PDF for a rental into an in-memory ZIP via `archiver`.
- **`extension-requests/`** — `PortalExtensionRequestsService`. Approval
  calls the new, additive `RentalsService.extendPlannedEnd()` (see ADR
  0012 decision 4) — the only new business-logic method this task added to
  an existing staff-facing service.
- **`damage-reports/`** — `PortalDamageReportsService`. `RentalDamageReport`
  is its own model (not a `Document` row — see ADR 0012 decision 5);
  `convertToDocument()` is staff-initiated and creates a real
  `DAMAGE_REPORT` document via `DocumentsService.create()`.
- **`messages/`** — `PortalMessagesService`. One `CustomerPortalMessage`
  table serves both directions (`senderType CUSTOMER|STAFF`), optionally
  scoped to a rental. Fetching a thread as one party marks the other
  party's unread messages read as a side effect.
- **`notifications/`** — `PortalNotificationsService`. In-app only
  (`CustomerNotification`), no email/push delivery — created by the other
  portal services (message sent, extension responded, damage report
  reviewed, etc.).
- **`assets/`** — `PortalAssetsService` (equipment info minus financial/
  internal fields, images, QR code). The QR code encodes a link to the
  authenticated portal rental page — no new unauthenticated public
  asset-lookup surface was built.
- **`dashboard/`** — `PortalDashboardService.summary()`, a single
  `Promise.all` of counts already derivable from the modules above.
- **`staff/`** — `StaffPortalController`, one controller consolidating
  every staff-facing portal-administration action (respond to extension
  requests, review/convert damage reports, reply to portal messages, view
  a customer's portal access status), gated by one new permission,
  `customers.portal.manage`.

### Permissions

One new permission, `customers.portal.manage` (OWNER/ADMIN/MANAGER by
default), gates every staff-facing portal-administration route in
`StaffPortalController` and `CustomerPortalInvitationsController`.

### Frontend

`apps/web/src/app/portal/**` — a fully separate, unauthenticated-by-default
route tree outside `app/app/**`: `portal/login`, `portal/invite/[token]`
(public), and a route group `portal/(shell)` (dashboard, rentals + detail,
calendar, documents + detail, messages, notifications, asset detail) gated
by its own `usePortalMe()` check, mirroring `app/app/layout.tsx`'s pattern
but against the portal session instead of the staff one. Dark mode is a
client-only preference (`useDarkMode`, toggles `<html class="dark">`,
persisted in `localStorage`), independent of the staff app. Staff-side
portal management (invite/revoke, extension requests, damage reports,
messages) is a `CustomerPortalPanel` embedded on the existing customer
detail page, gated by `customers.portal.manage`.

### Havelio rebrand

Every user-facing string, page title, browser tab title, email template,
and generated-document footer now reads "Havelio" instead of "RentOS" —
`packages/shared/APP_NAME`, the root `<title>`, all six locale files'
`app.name`, and the document footer template. Package names, internal
module/class names, and cookie names are deliberately untouched (see ADR
0012 decision 10).
