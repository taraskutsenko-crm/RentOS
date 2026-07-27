# RentOS

**One Platform. Every Asset.**

RentOS is a multi-tenant SaaS platform for asset and rental management,
designed to support any asset type, any country, any language, subscription
billing, and future mobile clients through an API-first architecture.

> **Status:** Production infrastructure, authentication, multi-tenant RBAC,
> and the first business module (Customers) are complete. Registration,
> login/logout, rotating refresh tokens, tenant onboarding, tenant-isolated
> access control, and full customer CRUD (search, filter, pagination) are
> all implemented and tested end-to-end. Remaining business modules
> (assets, rentals, billing) are still out of scope until explicitly
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

## Monorepo Structure

```
apps/
  web/            Next.js frontend — App Router, Tailwind v4, auth + customers pages, protected /app shell
  api/            NestJS backend — auth, users, tenants, memberships, customers, audit modules
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
`Customer`, plus `MembershipRole`/`MembershipStatus`/`CustomerStatus`
enums. No other business schema (assets, rentals) has been added.

## Environment Variables

See [`.env.example`](.env.example) at the repository root (used by Docker
Compose), and `.env.example` in [`apps/api`](apps/api/.env.example) /
[`apps/web`](apps/web/.env.example) for running each app directly outside
Docker. Environment variables consumed by the API are validated at startup
via a zod schema in [`packages/shared`](packages/shared/src/env.ts). See
[docs/architecture.md](docs/architecture.md#required-environment-variables)
for the auth-specific variables.

## Roadmap

Deliberately out of scope so far:

- Remaining business modules (assets, rentals, billing)
- OAuth, email sending, password reset, two-factor authentication
- Theming, background jobs (BullMQ)

These will be introduced in subsequent, explicitly scoped tasks.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

See [LICENSE](LICENSE).
