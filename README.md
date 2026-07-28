# RentOS

**One Platform. Every Asset.**

RentOS is a multi-tenant SaaS platform for asset and rental management,
designed to support any asset type, any country, any language, subscription
billing, and future mobile clients through an API-first architecture.

> **Status:** Production infrastructure, authentication, multi-tenant RBAC,
> and the Customers, Assets, and Rentals business modules are complete.
> Registration, login/logout, rotating refresh tokens, tenant onboarding,
> tenant-isolated access control, full customer CRUD, a universal Assets
> module (categories, tenant-configurable statuses, category-scoped custom
> fields, images/documents, status/location history, and a unified
> timeline), and a universal Rentals module (booking wizard, lifecycle
> state machine, real availability/double-booking prevention, automatic
> pricing) are all implemented and tested end-to-end. Remaining business
> modules (billing, invoicing) are still out of scope until explicitly
> requested.

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
- **Partial returns** — return some items while a rental stays `ACTIVE`;
  each returned asset is immediately available for a new booking.
- **Booking wizard** — a 6-step guided flow (customer → assets → dates →
  pricing → review → create) plus a visual availability calendar.
- **Granular permissions** — `rentals.view/create/update/delete/reserve/
start/return/cancel`, enforced by the same `PermissionsGuard` as Assets.

See [docs/api.md](docs/api.md#rentals) for the full endpoint reference, and
[ADR 0006](docs/adr/0006-rental-lifecycle-and-availability.md) for the
lifecycle, availability, and pricing design rationale.

## Monorepo Structure

```
apps/
  web/            Next.js frontend — App Router, Tailwind v4, auth + customers pages, protected /app shell
  api/            NestJS backend — auth, users, tenants, memberships, customers, assets, rentals, permissions, storage, audit modules
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
`RentalItem`, `RentalStatusHistory`, plus
`MembershipRole`/`MembershipStatus`/`CustomerStatus`/`AssetFieldType`/
`AssetDocumentType`/`RentalStatus`/`RentalBillingMode` enums. No other
business schema (billing, invoicing) has been added.

## Environment Variables

See [`.env.example`](.env.example) at the repository root (used by Docker
Compose), and `.env.example` in [`apps/api`](apps/api/.env.example) /
[`apps/web`](apps/web/.env.example) for running each app directly outside
Docker. Environment variables consumed by the API are validated at startup
via a zod schema in [`packages/shared`](packages/shared/src/env.ts). See
[docs/architecture.md](docs/architecture.md#required-environment-variables)
for the auth-specific variables, and
[docs/architecture.md#asset-file-storage](docs/architecture.md#asset-file-storage)
for `STORAGE_LOCAL_DIR`.

## Roadmap

Deliberately out of scope so far:

- Quotations as a distinct commercial document, invoices, payments,
  deposits handling, maintenance/repair workflows
- Branches, warehouses, GPS tracking, customer portal
- OAuth, email sending, password reset, two-factor authentication
- Theming, background jobs (BullMQ)

These will be introduced in subsequent, explicitly scoped tasks.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

See [LICENSE](LICENSE).
