# RentOS

**One Platform. Every Asset.**

RentOS is a multi-tenant SaaS platform for asset and rental management,
designed to support any asset type, any country, any language, subscription
billing, and future mobile clients through an API-first architecture.

> **Status:** Project foundation. This repository currently contains only the
> monorepo skeleton and tooling configuration — no application code,
> database, authentication, or infrastructure has been implemented yet.

## Tech Stack

| Layer    | Choices                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Frontend | Next.js, React, TypeScript, TailwindCSS, shadcn/ui, TanStack Query, Zustand, React Hook Form, Zod, i18next |
| Backend  | NestJS, TypeScript, Prisma, PostgreSQL, Redis, BullMQ                                                      |
| Infra    | Docker, Docker Compose, GitHub Actions                                                                     |
| Auth     | JWT, Role-Based Access Control                                                                             |

These are the platform's intended technology choices; most are not yet wired
into the repository (see [Roadmap](#roadmap)).

## Monorepo Structure

```
apps/
  web/            Next.js frontend (placeholder)
  api/            NestJS backend (placeholder)
packages/
  ui/             Shared UI component library (placeholder)
  shared/         Shared types, utilities, constants (placeholder)
  config/         Shared TypeScript & ESLint configuration
docs/             Architecture and reference documentation
docker/           Container definitions (reserved)
scripts/          Repository automation (reserved)
.github/          GitHub configuration (reserved)
```

This repository is managed with [pnpm workspaces](https://pnpm.io/workspaces)
and [Turborepo](https://turbo.build/repo).

## Requirements

- Node.js >= 20
- pnpm (see `packageManager` in [package.json](package.json))

## Getting Started

```bash
pnpm install
pnpm build
pnpm lint
pnpm typecheck
pnpm format:check
```

## Available Scripts

| Script              | Description                              |
| ------------------- | ---------------------------------------- |
| `pnpm build`        | Build all workspaces via Turborepo       |
| `pnpm dev`          | Run all workspaces in development mode   |
| `pnpm lint`         | Lint all workspaces via Turborepo        |
| `pnpm typecheck`    | Type-check all workspaces via Turborepo  |
| `pnpm format`       | Format the repository with Prettier      |
| `pnpm format:check` | Check formatting without writing changes |

## Roadmap

This initialization step deliberately excludes:

- Application code, pages, and API endpoints
- Database and Prisma configuration
- Docker and Docker Compose configuration
- Authentication implementation
- CI/CD workflows
- Business modules (assets, rentals, customers, billing)

These will be introduced in subsequent, explicitly scoped tasks.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

See [LICENSE](LICENSE).
