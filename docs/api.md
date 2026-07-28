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

---

`PublicUser` is the `User` model with `passwordHash` always stripped —
verified by an automated test that no response body ever contains
`passwordHash` or `tokenHash`.
