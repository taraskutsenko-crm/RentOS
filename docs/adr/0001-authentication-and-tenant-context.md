# ADR 0001: Authentication and Tenant-Context Strategy

**Status:** Accepted
**Date:** 2026-07-27

## Context

RentOS is a multi-tenant SaaS platform: a single user account may belong to
several tenants (companies), each with its own role. We need an
authentication and tenant-resolution strategy that is:

- Safe against XSS token theft (no tokens in `localStorage`/JS-readable storage).
- Correct under tenant switching (a user active in one tenant must never
  see another tenant's data, even if they hold a valid session).
- Workable for both the web app and future native/mobile clients hitting
  the same API directly (API-first).
- Simple enough to build and reason about at foundation stage, without
  precluding future hardening (reuse-detection, device binding, etc).

## Decision

### Browser-to-API flow

The browser talks **directly** to the NestJS API (no BFF/proxy layer in
Next.js) so that the same API surface serves both the web app and future
mobile clients identically. Authentication state lives in three
`httpOnly` cookies set by the API:

| Cookie                 | Contents                         | Path    | Lifetime                                    |
| ---------------------- | -------------------------------- | ------- | ------------------------------------------- |
| `rentos_access_token`  | Short-lived signed JWT           | `/`     | `ACCESS_TOKEN_TTL_SECONDS` (default 15 min) |
| `rentos_refresh_token` | Opaque random token (base64url)  | `/auth` | `REFRESH_TOKEN_TTL_DAYS` (default 30 days)  |
| `rentos_tenant_id`     | Active tenant hint (not trusted) | `/`     | Session                                     |

All three are `httpOnly`, `SameSite=Lax`, and `Secure` in production
(`NODE_ENV=production`). None are ever readable by JavaScript — this is
the primary defense against XSS-based token theft, which is why we did
**not** use `localStorage`/`sessionStorage`.

`SameSite=Lax` (not `Strict`) is required because top-level navigations
(e.g. following a link) must still carry the cookie; `Lax` still blocks
the classic cross-site POST CSRF pattern for our cookie-driven mutations
since they're same-site XHR/fetch calls, not cross-site form posts.

The web app and API run on different ports in development
(`localhost:3000` / `localhost:4000`) and, in production, are expected to
share a parent domain (e.g. `app.rentos.com` / `api.rentos.com`). Cookies
are host-only by default; `COOKIE_DOMAIN` can be set to the shared parent
domain (`.rentos.com`) in production so the API's cookies are sent on
requests to itself regardless of which subdomain served the page. CORS is
configured with `credentials: true` and an explicit `WEB_ORIGIN` allow-list
(never a wildcard) since credentialed requests require an exact origin.

### Access tokens

Short-lived (15 min default) signed JWTs (`HS256`, `JWT_ACCESS_SECRET`),
containing only `{ sub: userId }`. **No tenant or role claim is embedded.**
`JwtAuthGuard` verifies the signature/expiry and then re-fetches the user
from the database on every request, rejecting if the account has since
been deactivated or soft-deleted. This costs one query per request but
means deactivation takes effect immediately rather than waiting for token
expiry — an explicit tradeoff in favor of correctness over the last bit of
latency, appropriate at this scale.

### Refresh tokens

Opaque random values (384 bits), **not** JWTs. Only a SHA-256 hash is ever
persisted (`RefreshToken.tokenHash`) — a database leak does not yield
usable tokens. SHA-256 (fast, deterministic) is deliberately used here
instead of argon2/bcrypt: those algorithms are intentionally slow to
resist offline brute-forcing of _low-entropy_ secrets like passwords,
which does not apply to a 384-bit random token that must be looked up by
exact hash on every refresh call.

Every `/auth/refresh` call **rotates**: the presented token is revoked
(`revokedAt` set) and a brand-new one is issued and stored, atomically, in
the same database transaction. Presenting an already-revoked token fails
with 401. We do not yet implement reuse-triggers-full-logout (revoking
_every_ token for a user when a revoked token is replayed) — see Known
Limitations in the completion report.

### Tenant resolution — never trust the client

`TenantGuard` resolves the tenant for a request from the `:tenantId` route
param (falling back to the `rentos_tenant_id` cookie), then **always**
re-queries the database for an `ACTIVE` `TenantMembership` for the current
user before proceeding. The tenant ID is metadata, never an authorization
claim — this is what makes cross-tenant access and suspended-membership
lockout work correctly even though the tenant ID travels in a cookie a
client could tamper with.

We explicitly rejected embedding the active tenant in the JWT: doing so
would require re-issuing the access token on every `POST
/tenants/:id/select`, and — more importantly — a JWT claim can't be
revoked mid-lifetime, so a membership suspended after token issuance would
still "look" valid until the token expired. Per-request DB verification
closes that gap at the cost of one extra query on tenant-scoped routes.

### RBAC

`TenantMembership.role` (`OWNER | ADMIN | MANAGER | ACCOUNTANT |
TECHNICIAN | VIEWER`) is the source of truth. `RolesGuard` (global,
no-op unless a route carries `@Roles(...)` metadata) reads
`request.tenant.membership.role` — populated by `TenantGuard`, which must
run first. No endpoint in this task actually restricts by role yet
(everything here is either public or "any active member"); this is a
clean extension point for future business endpoints.

### Password hashing

`argon2id` (via `argon2`), the OWASP-recommended default, with library
defaults for memory/time cost. Verification always goes through
`argon2.verify`, which is constant-time with respect to the stored hash.

### Rate limiting

`@nestjs/throttler`, global default (120 req/min/IP) plus stricter
per-route limits on `/auth/register`, `/auth/login` (5/min), and
`/auth/refresh` (10/min).

## Consequences

- Every authenticated request costs one extra `users` query
  (`JwtAuthGuard`), and every tenant-scoped request costs one more
  (`TenantGuard`). Acceptable at this stage; a follow-up could cache the
  active-membership check in Redis (already in the stack) if it becomes a
  bottleneck.
- Because tokens live in `httpOnly` cookies, native/mobile clients that
  can't hold cookies the same way a browser does will need either a
  cookie jar (many HTTP clients support this transparently) or a future
  bearer-token variant of these same endpoints. Not needed yet — RentOS
  has no mobile client in this task.
- CSRF: since mutations require `credentials: 'include'` and the API only
  accepts the configured `WEB_ORIGIN`, and `SameSite=Lax` blocks
  cross-site form-post-triggered cookie attachment for state-changing
  requests, we consider CSRF risk adequately mitigated for this stage
  without a separate CSRF token. Revisit if a cross-site integration
  needs to call these endpoints with credentials.
