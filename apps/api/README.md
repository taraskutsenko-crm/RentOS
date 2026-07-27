# @rentos/api

RentOS API application — NestJS, Prisma, PostgreSQL, authentication &
multi-tenant RBAC. See [docs/architecture.md](../../docs/architecture.md)
and [docs/api.md](../../docs/api.md) for the full auth/tenancy reference.

## Scripts

| Script                 | Description                                           |
| ---------------------- | ----------------------------------------------------- |
| `pnpm dev`             | Run with `tsx watch` (hot reload)                     |
| `pnpm build`           | `prisma generate` + `tsc` build                       |
| `pnpm start`           | Run the compiled build (`dist/main.js`)               |
| `pnpm lint`            | ESLint (shared preset, DI-aware overrides)            |
| `pnpm typecheck`       | `prisma generate` + `tsc --noEmit` (includes `test/`) |
| `pnpm test`            | Integration tests (Vitest + Supertest, real Postgres) |
| `pnpm prisma:generate` | Generate the Prisma Client                            |
| `pnpm prisma:migrate`  | Create/apply a migration in development               |
| `pnpm prisma:deploy`   | Apply pending migrations (production)                 |
| `pnpm prisma:studio`   | Open Prisma Studio                                    |

## Structure

- `src/main.ts` — bootstrap (helmet, cookie-parser, CORS with credentials, global `ValidationPipe`)
- `src/app.module.ts` — root module (env validation via `@rentos/shared`, global rate limiting)
- `src/auth/` — register/login/refresh/logout/me, password hashing, tokens, cookies, guards, decorators
- `src/users/`, `src/tenants/`, `src/memberships/`, `src/audit/` — feature modules
- `src/prisma/` — global `PrismaModule`/`PrismaService`
- `src/health/` — `GET /health`, includes a live database check
- `prisma/schema.prisma` — `User`, `Tenant`, `TenantMembership`, `RefreshToken`, `AuditLog`
- `test/` — integration tests (`*.e2e-spec.ts`), run against a real
  dedicated test database (`.env.test`, never the dev/prod database)

No business modules (assets, rentals, customers, billing) have been added yet.
