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

| Variable                   | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `WEB_ORIGIN`               | Exact origin allowed to call the API with credentials (CORS)   |
| `JWT_ACCESS_SECRET`        | HMAC secret for signing access tokens (≥32 chars)              |
| `ACCESS_TOKEN_TTL_SECONDS` | Access token lifetime (default 900 = 15 min)                   |
| `REFRESH_TOKEN_TTL_DAYS`   | Refresh token lifetime (default 30)                            |
| `COOKIE_DOMAIN`            | Optional; set in production to share cookies across subdomains |

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
