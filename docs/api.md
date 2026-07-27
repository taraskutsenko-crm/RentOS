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

---

`PublicUser` is the `User` model with `passwordHash` always stripped —
verified by an automated test that no response body ever contains
`passwordHash` or `tokenHash`.
