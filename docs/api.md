# API Reference — Authentication, Tenancy & Customers

Base URL: `NEXT_PUBLIC_API_URL` (`http://localhost:4000` in local dev).
All endpoints are JSON. Authenticated endpoints read the
`rentos_access_token` cookie automatically — clients must send
`credentials: 'include'`. See [ADR 0001](adr/0001-authentication-and-tenant-context.md)
for the full rationale.

## `POST /auth/register`

Public. Rate-limited (5/min/IP). Creates a `User`, `Tenant`, and an
`OWNER` `TenantMembership` atomically in one transaction, then signs the
user in (sets all three auth cookies).

**Body**

| Field             | Type   | Notes                                             |
| ----------------- | ------ | ------------------------------------------------- |
| `email`           | string | Must be unique (case-insensitive, normalized)     |
| `password`        | string | ≥12 chars, upper+lower+digit                      |
| `firstName`       | string |                                                   |
| `lastName`        | string |                                                   |
| `companyName`     | string | Becomes the new tenant's name                     |
| `countryCode`     | string | ISO 3166-1 alpha-2, must be in the supported list |
| `defaultLanguage` | string | ISO 639-1                                         |
| `defaultCurrency` | string | ISO 4217                                          |
| `timezone`        | string | IANA time zone                                    |

**201** → `{ user: PublicUser, tenant: Tenant }`
**409** → email already registered, or unsupported country code
**400** → validation failure (weak password, missing field, etc.)

## `POST /auth/login`

Public. Rate-limited (5/min/IP).

**Body:** `{ email, password }`

**200** → `{ user: PublicUser }`, sets access + refresh cookies
**401** → wrong password, unknown email, or inactive/deleted account
(deliberately generic for the first two; see ADR for the tradeoff on the
inactive-account message)

## `POST /auth/refresh`

Public (does not require a valid access token — that's the point).
Rate-limited (10/min/IP). Reads `rentos_refresh_token`, rotates it
(revokes the old one, issues a new one), and issues a fresh access token.

**200** → `{ ok: true }`, sets new access + refresh cookies
**401** → missing, invalid, expired, or already-revoked refresh token

## `POST /auth/logout`

Requires authentication. Revokes the presented refresh token (if any) and
clears all three auth cookies.

**200** → `{ ok: true }`

## `GET /auth/me`

Requires authentication.

**200** → `{ user: PublicUser }`
**401** → no/invalid/expired access token, or account no longer active

## `GET /tenants`

Requires authentication. Returns only tenants where the current user has
an `ACTIVE` membership.

**200** → `{ tenants: Tenant[] }`

## `POST /tenants/:tenantId/select`

Requires authentication + active membership in `:tenantId` (`TenantGuard`
verifies this against the database — a tampered ID is rejected). Sets the
`rentos_tenant_id` cookie.

**201** → `{ tenant: Tenant, role: MembershipRole }`
**403** → not a member, membership not `ACTIVE`, or tenant inactive/deleted

## `GET /tenants/:tenantId`

Same guard as above.

**200** → `{ tenant: Tenant, role: MembershipRole }`
**403** → not a member, membership not `ACTIVE`, or tenant inactive/deleted

## Customers

All endpoints require authentication + active membership in `:tenantId`
(`TenantGuard`, same as the `/tenants/:tenantId` endpoints above). Records
are soft-deleted (`deletedAt`) and always scoped server-side by `tenantId`
— never trusted from the URL alone.

### `POST /tenants/:tenantId/customers`

**Body**

| Field       | Type   | Notes                                                          |
| ----------- | ------ | -------------------------------------------------------------- |
| `firstName` | string | Required, 1–100 chars                                          |
| `lastName`  | string | Required, 1–100 chars                                          |
| `company`   | string | Optional, ≤200 chars                                           |
| `phone`     | string | Optional, ≤50 chars                                            |
| `email`     | string | Optional, must be valid if set                                 |
| `vatNumber` | string | Optional, ≤50 chars (free-text; no per-country validation yet) |
| `address`   | string | Optional, ≤500 chars                                           |
| `notes`     | string | Optional, ≤2000 chars                                          |
| `status`    | enum   | `ACTIVE` \| `INACTIVE`, defaults to `ACTIVE`                   |

**201** → the created `Customer`
**400** → validation failure
**403** → not an active member of `:tenantId`

### `GET /tenants/:tenantId/customers`

**Query params:** `page` (default 1), `pageSize` (default 20, max 100),
`search` (matches first/last name, company, email, phone —
case-insensitive substring), `status` (`ACTIVE` \| `INACTIVE`)

**200** → `{ items: Customer[], total: number, page: number, pageSize: number }`

### `GET /tenants/:tenantId/customers/:id`

**200** → the `Customer`
**404** → not found (including soft-deleted, or belonging to another tenant)

### `PATCH /tenants/:tenantId/customers/:id`

Body: any subset of the `POST` fields.

**200** → the updated `Customer`
**404** → not found

### `DELETE /tenants/:tenantId/customers/:id`

Soft-delete (sets `deletedAt`, `status = INACTIVE`).

**204** → no content
**404** → not found

Every create/update/delete writes an `AuditLog` entry
(`customer.created` / `customer.updated` / `customer.deleted`).

## Permissions

Every asset-module endpoint requires authentication + active tenant
membership (`TenantGuard`) **and** a specific granular permission
(`PermissionsGuard` + `@RequirePermissions(...)`) — never a bare role-name
check. See `apps/api/src/permissions/permission.ts` for the source of
truth.

| Permission                | OWNER | ADMIN | MANAGER | TECHNICIAN | ACCOUNTANT | VIEWER |
| ------------------------- | :---: | :---: | :-----: | :--------: | :--------: | :----: |
| `assets.read`             |  ✅   |  ✅   |   ✅    |     ✅     |     ✅     |   ✅   |
| `assets.create`           |  ✅   |  ✅   |   ✅    |            |            |        |
| `assets.update`           |  ✅   |  ✅   |   ✅    |     ✅     |            |        |
| `assets.delete`           |  ✅   |  ✅   |         |            |            |        |
| `assets.change_status`    |  ✅   |  ✅   |   ✅    |     ✅     |            |        |
| `assets.manage_images`    |  ✅   |  ✅   |   ✅    |     ✅     |            |        |
| `assets.manage_documents` |  ✅   |  ✅   |   ✅    |     ✅     |            |        |
| `asset_categories.read`   |  ✅   |  ✅   |   ✅    |     ✅     |     ✅     |   ✅   |
| `asset_categories.manage` |  ✅   |  ✅   |         |            |            |        |
| `asset_fields.read`       |  ✅   |  ✅   |   ✅    |     ✅     |     ✅     |   ✅   |
| `asset_fields.manage`     |  ✅   |  ✅   |         |            |            |        |
| `asset_statuses.read`     |  ✅   |  ✅   |   ✅    |     ✅     |     ✅     |   ✅   |
| `asset_statuses.manage`   |  ✅   |  ✅   |         |            |            |        |
| `rentals.view`            |  ✅   |  ✅   |   ✅    |     ✅     |     ✅     |   ✅   |
| `rentals.create`          |  ✅   |  ✅   |   ✅    |            |            |        |
| `rentals.update`          |  ✅   |  ✅   |   ✅    |            |            |        |
| `rentals.delete`          |  ✅   |  ✅   |         |            |            |        |
| `rentals.reserve`         |  ✅   |  ✅   |   ✅    |            |            |        |
| `rentals.start`           |  ✅   |  ✅   |   ✅    |     ✅     |            |        |
| `rentals.return`          |  ✅   |  ✅   |   ✅    |     ✅     |            |        |
| `rentals.cancel`          |  ✅   |  ✅   |   ✅    |            |            |        |

`rentals.update` also covers location-independent edits (dates/items are
only editable in `DRAFT`/`QUOTE` — see [ADR 0006](adr/0006-rental-lifecycle-and-availability.md)).
TECHNICIAN — the role that physically handles equipment — gets `view`,
`start`, and `return` (the two lifecycle steps tied to physically handing
over or receiving back an asset) but not `create`/`update`/`reserve`/
`cancel`, which are commercial/booking decisions.

`assets.update` also covers location changes (`POST .../location`) —
there is no separate permission for it, since location is just another
asset attribute. Note: TECHNICIAN's `assets.update` is currently
resource-level (the whole asset), not field-scoped to only
condition/location as the product intent describes — see
[ADR 0004](adr/0004-configurable-asset-statuses.md) and the completion
report's Known Limitations for the documented gap.

## Assets

All endpoints require authentication + active membership in `:tenantId`
(`TenantGuard`) plus the specific permission noted per endpoint
(`PermissionsGuard`). Records are soft-deleted (`deletedAt`) and always
scoped server-side by `tenantId`. Business logic is universal — there is no
asset-type-specific behavior anywhere in this module; type-specific
attributes are represented entirely through custom fields (see below).

### `POST /tenants/:tenantId/assets`

Requires `assets.create`.

**Body** (all money fields are integer minor units; both halves of a
money pair must be present together)

| Field                                         | Type          | Notes                                                         |
| --------------------------------------------- | ------------- | ------------------------------------------------------------- |
| `name`                                        | string        | Required                                                      |
| `internalNumber`                              | string        | Required, unique per tenant                                   |
| `categoryId`                                  | string        | Required, must belong to the same tenant                      |
| `statusId`                                    | string        | Optional — defaults to the tenant's `AVAILABLE` system status |
| `sku`/`serialNumber`/`barcode`/`qrCodeValue`  | string        | Optional, unique per tenant when present                      |
| `manufacturer`/`model`                        | string        | Optional                                                      |
| `description`                                 | string        | Optional                                                      |
| `purchaseDate`                                | string        | Optional, ISO date                                            |
| `purchasePriceMinor`/`purchaseCurrency`       | number/string | Optional, must be set together                                |
| `replacementValueMinor`/`replacementCurrency` | number/string | Optional, must be set together                                |
| `currentLocationText`                         | string        | Optional, initial location (no history entry on create)       |
| `conditionNotes`                              | string        | Optional                                                      |
| `isRentable`/`isActive`                       | boolean       | Optional, default `true`                                      |
| `customFields`                                | object        | Optional, keyed by `AssetCustomFieldDefinition.key`           |

**201** → the created asset (see response shape below)
**400** → validation failure, missing required custom field, invalid custom field value, or a money value without its paired currency
**404** → `categoryId` or `statusId` does not belong to this tenant
**409** → `internalNumber`/`sku`/`serialNumber`/`barcode`/`qrCodeValue` already used in this tenant

**Response shape** (also returned by `GET .../:assetId`, `PATCH`,
`.../status`, `.../location`):

```json
{
  "id": "...",
  "tenantId": "...",
  "categoryId": "...",
  "currentStatusId": "...",
  "name": "...",
  "internalNumber": "...",
  "...every scalar Asset column...": "...",
  "category": { "id": "...", "name": "..." },
  "currentStatus": {
    "id": "...",
    "code": "AVAILABLE",
    "name": "...",
    "isAvailableForRental": true
  },
  "customFields": { "vin": "1HGCM82633A004352", "mileage": 42000 },
  "images": [{ "id": "...", "isPrimary": true, "...": "..." }],
  "documents": [{ "id": "...", "documentType": "MANUAL", "...": "..." }]
}
```

`customFields` is keyed by `key` (not `fieldDefinitionId`) with each value
already normalized to its typed representation. List responses
(`GET .../assets`) include `primaryImage` instead of the full `images`/`documents`
arrays, to keep list queries lightweight.

### `GET /tenants/:tenantId/assets`

Requires `assets.read`.

**Query params:** `page`, `pageSize` (max 100), `search` (name,
internalNumber, sku, serialNumber, barcode, manufacturer, model, and any
`isSearchable` custom field), `categoryId`, `statusId`, `isRentable`,
`isActive`, `manufacturer`, `model`, `internalNumber`, `sortBy`
(`name`/`internalNumber`/`manufacturer`/`model`/`createdAt`/`updatedAt`/`purchaseDate`),
`sortDirection` (`asc`/`desc`), `customFields` (JSON-encoded object of
`{ [fieldKey]: value }`, matched only against `isFilterable` definitions —
unknown keys are silently ignored, not an error).

**200** → `{ items: Asset[], total, page, pageSize }`

### `GET /tenants/:tenantId/assets/:assetId`

Requires `assets.read`. **200** → the asset. **404** → not found (including soft-deleted, or another tenant's).

### `PATCH /tenants/:tenantId/assets/:assetId`

Requires `assets.update`. Body: any subset of the `POST` fields **except**
`statusId` and `currentLocationText` — those change only through the
dedicated `.../status` and `.../location` endpoints below, so every
transition is recorded in history. **200** → the updated asset.

### `DELETE /tenants/:tenantId/assets/:assetId`

Requires `assets.delete`. Soft-delete. **204** → no content.

### `POST /tenants/:tenantId/assets/:assetId/status`

Requires `assets.change_status`. **Body:** `{ statusId, reason? }`.
Atomically updates `currentStatusId` and inserts an `AssetStatusHistory`
row. **201** → the updated asset. **400** → target status is inactive.
**404** → status not found in this tenant.

### `POST /tenants/:tenantId/assets/:assetId/location`

Requires `assets.update`. **Body:** `{ newLocation, reason? }`. Inserts an
`AssetLocationHistory` row (`previousLocation` = the prior value).
**201** → the updated asset.

### `GET /tenants/:tenantId/assets/:assetId/timeline`

Requires `assets.read`. Returns a normalized, chronologically-sorted array
combining creation, updates, status changes, location changes, image
uploads, and document uploads — see
[docs/architecture.md#timeline-event-structure](architecture.md#timeline-event-structure).

## Asset Categories

Requires `asset_categories.read` (list/tree) or `asset_categories.manage`
(create/update/delete).

### `POST /tenants/:tenantId/asset-categories`

**Body:** `{ name, description?, code?, parentId?, isActive?, sortOrder? }`.
**201** → the created category. **409** → duplicate name within the same
`(tenantId, parentId)`. **404** → `parentId` not found in this tenant.

### `GET /tenants/:tenantId/asset-categories`

**Query params:** `page`, `pageSize`, `search`, `parentId`, `isActive`.
**200** → `{ items, total, page, pageSize }`.

### `GET /tenants/:tenantId/asset-categories/tree`

**200** → the full category tree, nested via `children[]`.

### `PATCH /tenants/:tenantId/asset-categories/:categoryId`

**409** → the new `parentId` would create a cycle, or a name clash exists
at the target level.

### `DELETE /tenants/:tenantId/asset-categories/:categoryId`

Soft-delete. **409** → active assets or active subcategories still
reference this category.

## Asset Statuses

Requires `asset_statuses.read` (list) or `asset_statuses.manage`
(create/update/delete).

### `GET /tenants/:tenantId/asset-statuses`

**200** → every status for this tenant (system + custom), ordered by `sortOrder`.

### `POST /tenants/:tenantId/asset-statuses`

**Body:** `{ name, code, description?, colorToken?, icon?, isAvailableForRental?, sortOrder? }`.
`code` must be uppercase letters/digits/underscores. **409** → duplicate code.

### `PATCH /tenants/:tenantId/asset-statuses/:statusId`

**403** → attempting to change `code` on a system status (every other
field, including `name`, remains editable on system statuses).

### `DELETE /tenants/:tenantId/asset-statuses/:statusId`

**403** → system status. **409** → currently assigned to an active asset.

## Asset Custom Fields

Requires `asset_fields.read` (list) or `asset_fields.manage`
(create/update/delete).

### `POST /tenants/:tenantId/asset-custom-fields`

**Body:** `{ name, key, description?, categoryId?, fieldType, isRequired?, isActive?, isFilterable?, isSearchable?, sortOrder?, validationRules?, options? }`.
`key` must be lowercase letters/digits/underscores. `fieldType` is one of
`TEXT | TEXTAREA | INTEGER | DECIMAL | BOOLEAN | DATE | DATETIME | SELECT | MULTISELECT | URL | EMAIL | PHONE`.
`options` (`[{ value, label }]`) is required and non-empty for
`SELECT`/`MULTISELECT`. `categoryId` omitted means the field applies to
every asset regardless of category. **409** → duplicate `key` within the
same `(tenantId, categoryId)` scope.

### `GET /tenants/:tenantId/asset-custom-fields`

**Query params:** `page`, `pageSize`, `categoryId`, `fieldType`, `isActive`.

### `GET /tenants/:tenantId/asset-custom-fields/for-category/:categoryId`

**200** → every active definition applicable to this category (global +
category-specific), ordered by `sortOrder` — this is what the frontend
asset form uses to render the "Custom fields" section dynamically.

### `PATCH /tenants/:tenantId/asset-custom-fields/:fieldId`

**409** → changing `fieldType` while `AssetCustomFieldValue` rows still
reference this definition (remove the values first — see
[ADR 0003](adr/0003-custom-field-storage-strategy.md)).

### `DELETE /tenants/:tenantId/asset-custom-fields/:fieldId`

Soft-delete.

## Asset Images & Documents

All endpoints are nested under `/tenants/:tenantId/assets/:assetId/...`
and require `assets.manage_images` / `assets.manage_documents`
respectively for mutations, `assets.read` for the file-read endpoints.
Uploads are `multipart/form-data` (field name `file`) — see
[ADR 0005](adr/0005-asset-file-storage-strategy.md) for why direct upload
was chosen over a presigned-URL flow.

### `POST .../images`

Form fields: `file` (required, `image/jpeg`\|`image/png`\|`image/webp`,
≤ 8 MB), `altText?`, `isPrimary?`. The first image uploaded for an asset is
always made primary regardless of `isPrimary`. **201** → the image metadata row.

### `PATCH .../images/:imageId`

**Body:** `{ altText?, isPrimary?, sortOrder? }`.

### `DELETE .../images/:imageId`

Soft-delete + best-effort storage cleanup. **204** → no content.

### `GET .../images/:imageId/file`

Streams the image bytes (tenant/permission-checked — not a raw public URL).

### `POST .../documents`

Form fields: `file` (required, `application/pdf`\|image types, ≤ 20 MB),
`documentType` (`PURCHASE_DOCUMENT`\|`MANUAL`\|`CERTIFICATE`\|`INSURANCE`\|`REGISTRATION`\|`INSPECTION`\|`OTHER`),
`title`, `expiresAt?`. **201** → the document metadata row.

### `DELETE .../documents/:documentId`

Soft-delete + best-effort storage cleanup.

### `GET .../documents/:documentId/file`

Streams the document bytes (tenant/permission-checked).

## Rentals

All endpoints live under `/tenants/:tenantId/rentals` (see
[ADR 0006](adr/0006-rental-lifecycle-and-availability.md) for why this
codebase namespaces every business module by tenant, rather than the flat
`/rentals` shorthand). Require authentication + active membership
(`TenantGuard`) plus the permission noted per endpoint
(`PermissionsGuard`). Records are soft-deleted and always scoped
server-side by `tenantId`. Business logic is universal — nothing here is
tied to a specific asset type.

### `POST /tenants/:tenantId/rentals`

Requires `rentals.create`. Creates a `DRAFT` rental with an
automatically-generated `rentalNumber` (`RNT-000001`, unique per tenant).

**Body**

| Field           | Type   | Notes                                                       |
| --------------- | ------ | ----------------------------------------------------------- |
| `customerId`    | string | Required, must belong to the same tenant                    |
| `plannedStart`  | string | Required, ISO date-time                                     |
| `plannedEnd`    | string | Required, ISO date-time, must be after `plannedStart`       |
| `currency`      | string | Optional, defaults to the tenant's default currency         |
| `discountMinor` | number | Optional, rental-level discount, integer minor units, ≥ 0   |
| `taxMinor`      | number | Optional, integer minor units, ≥ 0                          |
| `notes`         | string | Optional, customer-facing                                   |
| `internalNotes` | string | Optional, internal-only                                     |
| `items`         | array  | Optional (a draft may start empty) — see `RentalItem` below |

**`RentalItem` body shape** (each entry in `items`):

| Field                                                                       | Type   | Notes                                                         |
| --------------------------------------------------------------------------- | ------ | ------------------------------------------------------------- |
| `assetId`                                                                   | string | Required, must belong to the tenant, be active and rentable   |
| `quantity`                                                                  | number | Optional, default 1 — a pricing multiplier only, see ADR 0006 |
| `billingMode`                                                               | enum   | `DAILY` \| `WEEKLY` \| `MONTHLY` \| `CUSTOM`                  |
| `dailyPriceMinor`/`weeklyPriceMinor`/`monthlyPriceMinor`/`customPriceMinor` | number | Exactly the one matching `billingMode` is required            |
| `depositMinor`                                                              | number | Optional, default 0, ≥ 0                                      |
| `discountMinor`                                                             | number | Optional, default 0, ≥ 0 — this item's own discount           |
| `notes`                                                                     | string | Optional                                                      |

**201** → the created rental (see response shape below)
**400** → validation failure (missing customer/dates, end before start,
negative price/deposit, duplicate asset in one rental, inactive/
non-rentable asset)
**404** → `customerId` or an item's `assetId` doesn't belong to this
tenant, or the asset was soft-deleted

**Response shape** (also returned by `GET .../:id`, `PATCH`, and every
lifecycle action):

```json
{
  "id": "...",
  "tenantId": "...",
  "customerId": "...",
  "rentalNumber": "RNT-000001",
  "status": "DRAFT",
  "plannedStart": "...",
  "plannedEnd": "...",
  "actualStart": null,
  "actualEnd": null,
  "currency": "USD",
  "subtotalMinor": 3000,
  "discountMinor": 0,
  "taxMinor": 0,
  "totalMinor": 3000,
  "notes": null,
  "internalNotes": null,
  "customer": { "id": "...", "firstName": "...", "...": "..." },
  "items": [
    {
      "id": "...",
      "assetId": "...",
      "billingMode": "DAILY",
      "dailyPriceMinor": 1000,
      "returnedAt": null,
      "asset": { "...": "..." }
    }
  ]
}
```

### `GET /tenants/:tenantId/rentals`

Requires `rentals.view`.

**Query params:** `page`, `pageSize` (max 100), `search` (rentalNumber,
customer first/last name/company), `status`, `customerId`, `assetId`
(rentals containing this asset), `plannedStartFrom`/`plannedStartTo`,
`sortBy` (`rentalNumber`\|`plannedStart`\|`plannedEnd`\|`createdAt`\|`totalMinor`),
`sortDirection`.

**200** → `{ items: Rental[], total, page, pageSize }` — list items include
`itemCount` instead of the full `items` array.

### `GET /tenants/:tenantId/rentals/availability`

Requires `rentals.view`. The availability engine's read endpoint — see
[ADR 0006](adr/0006-rental-lifecycle-and-availability.md).

**Query params:** `assetIds` (comma-separated), `plannedStart`,
`plannedEnd`, `excludeRentalId?` (exclude a rental from its own conflict
check while editing it).

**200** → `{ results: [{ assetId, isAvailable, conflicts: [{ rentalId, rentalNumber, plannedStart, plannedEnd }] }] }`

### `GET /tenants/:tenantId/rentals/:id`

Requires `rentals.view`. **404** → not found (including soft-deleted, or another tenant's).

### `PATCH /tenants/:tenantId/rentals/:id`

Requires `rentals.update`. Body: any subset of the `POST` fields.
**409** → attempting to change `items`, `plannedStart`, or `plannedEnd`
on a rental that is no longer `DRAFT`/`QUOTE`.

### `DELETE /tenants/:tenantId/rentals/:id`

Requires `rentals.delete`. Soft-delete. **409** → rental is
`RESERVED`/`ACTIVE`/`RETURNED`/`COMPLETED` (cancel it first — deleting is
only for `DRAFT`/`QUOTE`/`CANCELLED`, which never became real operational
history).

### `POST /tenants/:tenantId/rentals/:id/reserve`

Requires `rentals.reserve`. **Body:** `{ reason? }`. Moves `DRAFT`/`QUOTE`
→ `RESERVED`. Re-validates every item's asset is still active/rentable,
then runs the hard availability check.
**400** → no items on the rental. **409** → wrong starting status, or an
availability conflict (lists every unavailable asset).

### `POST /tenants/:tenantId/rentals/:id/start`

Requires `rentals.start`. **Body:** `{ reason? }`. Moves `RESERVED` →
`ACTIVE`, sets `actualStart`, and (best-effort) moves every item's asset
to the tenant's `RENTED` status. **409** → wrong starting status.

### `POST /tenants/:tenantId/rentals/:id/return`

Requires `rentals.return`. **Body:** `{ itemIds?, reason? }` — omit
`itemIds` to return everything still outstanding (a full return).
Marks the targeted items' `returnedAt`; moves the rental to `RETURNED`
(and sets `actualEnd`) only once every item has been returned — a partial
return keeps it `ACTIVE`. Returned assets are (best-effort) moved back to
`AVAILABLE` and immediately become bookable again for the freed window.
**400** → wrong starting status (must be `ACTIVE`), or no unreturned items
match.

### `POST /tenants/:tenantId/rentals/:id/cancel`

Requires `rentals.cancel`. **Body:** `{ reason? }`. Allowed from `DRAFT`,
`QUOTE`, `RESERVED`, or `ACTIVE`. Cancelling an `ACTIVE` rental implicitly
returns and releases every not-yet-returned item. **409** → rental is
already `RETURNED`, `COMPLETED`, or `CANCELLED`.

### `GET /tenants/:tenantId/rentals/:id/timeline`

Requires `rentals.view`. Returns a normalized, chronologically-sorted
array combining creation, updates, status changes, and return events.

---

## Quotes

All authenticated endpoints live under `/tenants/:tenantId/quotes` (see
[ADR 0007](adr/0007-quotes-and-commercial-offers.md)). Require
authentication + active membership (`TenantGuard`) plus the permission
noted per endpoint (`PermissionsGuard`). A separate, unauthenticated
`/public/quotes/:token` namespace serves the customer-facing acceptance
flow — see below. Business logic is universal: `QuoteItem.itemType` is
never restricted to a specific rental industry.

### `POST /tenants/:tenantId/quotes`

Requires `quotes.create`. Creates a `DRAFT` quote with an
automatically-generated `quoteNumber` (`Q-2026-000001`, unique per
tenant, concurrency-safe — see ADR 0007's numbering section).

**Body**

| Field                | Type   | Notes                                                                    |
| -------------------- | ------ | ------------------------------------------------------------------------ |
| `customerId`         | string | Required, must belong to the same tenant                                 |
| `issueDate`          | string | Optional ISO date-time, defaults to now                                  |
| `validUntil`         | string | Required ISO date-time, must not be before `issueDate`                   |
| `plannedStart`       | string | Required ISO date-time                                                   |
| `plannedEnd`         | string | Required ISO date-time, must be after `plannedStart`                     |
| `currency`           | string | Optional, defaults to the tenant's default currency                      |
| `discountType`       | enum   | Optional, `PERCENTAGE` \| `FIXED`                                        |
| `discountValue`      | number | Optional, integer — basis points if `PERCENTAGE`, minor units if `FIXED` |
| `customerNotes`      | string | Optional, shown to the customer (PDF + public page)                      |
| `internalNotes`      | string | Optional, staff-only, never exposed publicly                             |
| `termsAndConditions` | string | Optional, shown to the customer                                          |
| `items`              | array  | Optional (a draft may start empty) — see `QuoteItem` below               |

**`QuoteItem` body shape** (each entry in `items`):

| Field                                                                       | Type        | Notes                                                                             |
| --------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------- |
| `itemType`                                                                  | enum        | `ASSET`\|`SERVICE`\|`PRODUCT`\|`FEE`\|`DELIVERY`\|`COLLECTION`\|`LABOR`\|`CUSTOM` |
| `assetId`                                                                   | string      | Required (and only allowed) when `itemType` is `ASSET`                            |
| `name`                                                                      | string      | Required                                                                          |
| `description`                                                               | string      | Optional                                                                          |
| `quantity`                                                                  | number      | Optional, default 1                                                               |
| `unit`                                                                      | string      | Optional, free-text display label (e.g. "day", "hour") — never priced             |
| `billingMode`                                                               | enum        | `DAILY`\|`WEEKLY`\|`MONTHLY`\|`CUSTOM`\|`FLAT` — `ASSET` items may not use `FLAT` |
| `unitPriceMinor`                                                            | number      | Required when `billingMode` is `FLAT` (= unitPrice × quantity)                    |
| `dailyPriceMinor`/`weeklyPriceMinor`/`monthlyPriceMinor`/`customPriceMinor` | number      | Exactly the one matching `billingMode` is required                                |
| `discountType`/`discountValue`                                              | enum/number | Optional, this line's own discount, same interpretation as above                  |
| `taxRateBp`                                                                 | number      | Optional, default 0, integer basis points (2000 = 20.00%)                         |
| `depositMinor`                                                              | number      | Optional, default 0                                                               |
| `sortOrder`                                                                 | number      | Optional, display order                                                           |
| `notes`                                                                     | string      | Optional                                                                          |

**201** → the created quote (response shape below), with a live
`availabilityWarnings` array (never blocking — see below)
**400** → validation failure (missing customer/dates, `validUntil`
before `issueDate`, end before start, an `ASSET` item without/with a
mismatched `assetId`, an `ASSET` item using `FLAT`, duplicate asset
lines, zero/negative quantity)
**404** → `customerId` or an item's `assetId` doesn't belong to this
tenant

**Response shape** (also returned by `GET .../:id`, `PATCH`, and every
lifecycle action except the public ones):

```json
{
  "id": "...",
  "tenantId": "...",
  "customerId": "...",
  "quoteNumber": "Q-2026-000001",
  "status": "DRAFT",
  "issueDate": "...",
  "validUntil": "...",
  "plannedStart": "...",
  "plannedEnd": "...",
  "currency": "USD",
  "subtotalMinor": 10800,
  "discountType": "FIXED",
  "discountValue": 500,
  "discountTotalMinor": 500,
  "taxTotalMinor": 1800,
  "depositTotalMinor": 2000,
  "totalMinor": 10300,
  "customerNotes": null,
  "internalNotes": null,
  "termsAndConditions": null,
  "acceptedAt": null,
  "acceptedBy": null,
  "rejectedAt": null,
  "rejectionReason": null,
  "duplicatedFromQuoteId": null,
  "customer": { "id": "...", "firstName": "...", "...": "..." },
  "items": [
    {
      "id": "...",
      "itemType": "ASSET",
      "assetId": "...",
      "lineTotalMinor": 10800,
      "asset": { "...": "..." }
    }
  ],
  "convertedRental": null,
  "availabilityWarnings": [
    {
      "assetId": "...",
      "conflicts": [
        { "rentalId": "...", "rentalNumber": "...", "plannedStart": "...", "plannedEnd": "..." }
      ]
    }
  ]
}
```

Note: `publicTokenHash` is never included in any response, authenticated
or public — see ADR 0007's public-token security section.

### `GET /tenants/:tenantId/quotes`

Requires `quotes.view`.

**Query params:** `page`, `pageSize` (max 100), `search` (quoteNumber,
customer first/last name/company), `status`, `customerId`,
`createdByUserId`, `issueDateFrom`/`issueDateTo`,
`validUntilFrom`/`validUntilTo`, `plannedStartFrom`/`plannedStartTo`,
`totalMinorFrom`/`totalMinorTo`, `expired` (boolean — `SENT`/`VIEWED`
past `validUntil`), `converted` (boolean), `sortBy`
(`quoteNumber`\|`issueDate`\|`validUntil`\|`plannedStart`\|`plannedEnd`\|`createdAt`\|`totalMinor`),
`sortDirection`.

**200** → `{ items: Quote[], total, page, pageSize }` — list items
include `itemCount` instead of the full `items` array.

### `GET /tenants/:tenantId/quotes/:id`

Requires `quotes.view`. **404** → not found (including soft-deleted, or
another tenant's).

### `PATCH /tenants/:tenantId/quotes/:id`

Requires `quotes.update`. Body: any subset of the `POST` fields.
**409** → attempting to change `customerId`, `plannedStart`,
`plannedEnd`, `currency`, `discountType`/`discountValue`, or `items` on a
quote that is no longer `DRAFT` (duplicate it instead — see ADR 0007);
or attempting to change `validUntil` once the quote is in a terminal
status (`ACCEPTED`/`REJECTED`/`EXPIRED`/`CONVERTED`/`CANCELLED`).
`customerNotes`/`internalNotes`/`termsAndConditions` may be edited
regardless of status.

### `DELETE /tenants/:tenantId/quotes/:id`

Requires `quotes.delete`. Soft-delete. **409** → quote is not `DRAFT` or
`CANCELLED` (cancel it first).

### `POST /tenants/:tenantId/quotes/:id/send`

Requires `quotes.send`. **Body:** `{ recipientEmail?, message? }` —
`recipientEmail` overrides the customer's on-file email for this send
only. First send moves `DRAFT` → `SENT`; a later call while
`SENT`/`VIEWED` is a resend (no status change) that regenerates the
public token and re-dispatches the email. A PDF is (re)generated and
attached. **400** → no items, or no email available. **409** → quote is
in a terminal status.

**200** → `{ quote: Quote, emailSent: boolean, emailError?: string }` —
`emailSent` and `emailError` honestly reflect what the configured
`EmailProvider` reported; the status change is never rolled back on a
failed send (see ADR 0007).

### `POST /tenants/:tenantId/quotes/:id/accept`

Requires `quotes.accept`. Staff-recorded acceptance (e.g. the customer
approved verbally or by email) — distinct from the public token-based
flow below. **Body:** `{ acceptedBy? }`. Idempotent: calling this again
on an already-`ACCEPTED` quote is a no-op. **409** → quote is not
`SENT`/`VIEWED`/`ACCEPTED`.

### `POST /tenants/:tenantId/quotes/:id/reject`

Requires `quotes.reject`. **Body:** `{ reason? }`. Idempotent. **409** →
quote is not `SENT`/`VIEWED`/`REJECTED`.

### `POST /tenants/:tenantId/quotes/:id/cancel`

Requires `quotes.update`. **Body:** `{ reason? }`. Allowed from `DRAFT`
or `SENT` only. Idempotent. **409** → quote is not
`DRAFT`/`SENT`/`CANCELLED`.

### `POST /tenants/:tenantId/quotes/:id/duplicate`

Requires `quotes.duplicate`. Creates a new `DRAFT` quote with a fresh
`quoteNumber`, `duplicatedFromQuoteId` set to the source, all
acceptance/rejection/conversion metadata cleared, and items/commercial
terms copied verbatim with totals recomputed under current rules.

### `POST /tenants/:tenantId/quotes/:id/convert-to-rental`

Requires `quotes.convert`. Only an `ACCEPTED` quote may be converted.
Inside one transaction: revalidates the customer and every `ASSET`
item's asset (tenant ownership, active, rentable), re-checks
availability for the planned window, then creates a `RESERVED` `Rental`
whose `RentalItem` rows come only from `ASSET`-type quote items — the
Rental's stored totals are copied verbatim from the Quote's own
authoritative totals (which include every item type), not recomputed
from just the asset items (see ADR 0007). Idempotent: calling this again
on an already-`CONVERTED` quote returns the same rental, never creating
a second one.
**400** → quote has no `ASSET` items. **409** → quote is not `ACCEPTED`
(and not already `CONVERTED`), or one or more assets are unavailable for
the planned window (lists every conflicting asset, mirroring the
Rentals `reserve` conflict shape).

**201** → `{ rental: Rental, alreadyConverted: boolean }`

### `GET /tenants/:tenantId/quotes/:id/pdf`

Requires `quotes.download`. Serves the most recently generated PDF,
generating one on first request if none exists yet. `Content-Type:
application/pdf`.

### `POST /tenants/:tenantId/quotes/:id/pdf`

Requires `quotes.download`. Forces regeneration — creates a new
`QuoteDocument` row and returns the fresh PDF bytes.

### `GET /tenants/:tenantId/quotes/:id/history`

Requires `quotes.view`. Returns a normalized, chronologically-sorted
array combining creation, updates, every status change, sends, views,
acceptance/rejection, duplication, conversion, and PDF generation.

### Public quote access — `/public/quotes/:token`

No authentication, no `tenantId` in the URL — a single high-entropy
token (only its SHA-256 hash is ever persisted) resolves directly to the
one quote it was issued for. Marked `@Public()` (exempt from the global
`JwtAuthGuard`) and throttled more tightly than the platform default.
Never exposes `internalNotes`, `tenantId`, user ids, or the token hash —
see ADR 0007's public-token security section for the full response
shape (`PublicQuoteView`).

- `GET /public/quotes/:token` — views the quote; the first view
  transitions `SENT` → `VIEWED` (idempotent — later views don't re-fire
  it). **404** → unknown, expired, or `CANCELLED` quote's token.
- `POST /public/quotes/:token/accept` — **Body:** `{ acceptedBy? }`.
  Idempotent. **409** → quote is not `SENT`/`VIEWED`/`ACCEPTED`.
- `POST /public/quotes/:token/reject` — **Body:** `{ reason? }`.
  Idempotent. **409** → quote is not `SENT`/`VIEWED`/`REJECTED`.
- `GET /public/quotes/:token/pdf` — same PDF the authenticated endpoint
  serves.

Acceptance/rejection here is explicitly labeled quote acceptance, not a
qualified electronic signature (see ADR 0007).

---

`PublicUser` is the `User` model with `passwordHash` always stripped —
verified by an automated test that no response body ever contains
`passwordHash` or `tokenHash`.
