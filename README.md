# RentOS

**One Platform. Every Asset.**

RentOS is a multi-tenant SaaS platform for asset and rental management,
designed to support any asset type, any country, any language, subscription
billing, and future mobile clients through an API-first architecture.

> **Status:** Production infrastructure complete. Docker, PostgreSQL, Redis,
> Prisma, the Next.js web app, and the NestJS API are all configured and
> wired together. No business modules (assets, rentals, customers, billing)
> or authentication have been implemented yet — that is intentionally out of
> scope until those tasks are explicitly requested.

## Tech Stack

| Layer    | Choices                                               |
| -------- | ----------------------------------------------------- |
| Frontend | Next.js, React, TypeScript, TailwindCSS v4, shadcn/ui |
| Backend  | NestJS, TypeScript, Prisma, PostgreSQL, Redis         |
| Infra    | Docker, Docker Compose, GitHub Actions                |

TanStack Query, Zustand, React Hook Form, Zod (for forms), i18next, BullMQ,
and JWT/RBAC auth are part of the platform's intended stack but are not yet
wired in — they land with the tasks that need them (data fetching, forms,
localization, background jobs, authentication).

## Monorepo Structure

```
apps/
  web/            Next.js frontend — App Router, Tailwind v4, consumes @rentos/ui
  api/            NestJS backend — Prisma, config validation, health check
packages/
  ui/             Shared UI component library (Tailwind v4 + shadcn/ui)
  shared/         Shared types, env validation (zod), constants
  config/         Shared TypeScript & ESLint configuration
docs/             Architecture and reference documentation
docker/           Dockerfiles' compose stack (postgres, redis, api, web)
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

Or run the entire stack (web, API, Postgres, Redis) in Docker:

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

Per-app scripts (`pnpm --filter @rentos/api <script>`):

| Script            | Description                             |
| ----------------- | --------------------------------------- |
| `prisma:generate` | Generate the Prisma Client              |
| `prisma:migrate`  | Create/apply a migration in development |
| `prisma:deploy`   | Apply pending migrations (production)   |
| `prisma:studio`   | Open Prisma Studio                      |

## Database

Prisma is configured against PostgreSQL in [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma).
The only model currently defined is `Tenant` — the multi-tenancy boundary
every future business entity will reference for isolation. It exists purely
so the initial migration has something real to apply; no other business
schema has been added.

## Environment Variables

See [`.env.example`](.env.example) at the repository root (used by Docker
Compose), and `.env.example` in [`apps/api`](apps/api/.env.example) /
[`apps/web`](apps/web/.env.example) for running each app directly outside
Docker. Environment variables consumed by the API are validated at startup
via a zod schema in [`packages/shared`](packages/shared/src/env.ts).

## Roadmap

Deliberately out of scope so far:

- Authentication implementation
- Business modules (assets, rentals, customers, billing)
- i18n, theming, background jobs (BullMQ), forms

These will be introduced in subsequent, explicitly scoped tasks.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

See [LICENSE](LICENSE).
