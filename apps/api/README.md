# @rentos/api

RentOS API application — NestJS, Prisma, PostgreSQL.

## Scripts

| Script                 | Description                                |
| ---------------------- | ------------------------------------------ |
| `pnpm dev`             | Run with `tsx watch` (hot reload)          |
| `pnpm build`           | `prisma generate` + `tsc` build            |
| `pnpm start`           | Run the compiled build (`dist/main.js`)    |
| `pnpm lint`            | ESLint (shared preset, DI-aware overrides) |
| `pnpm typecheck`       | `prisma generate` + `tsc --noEmit`         |
| `pnpm prisma:generate` | Generate the Prisma Client                 |
| `pnpm prisma:migrate`  | Create/apply a migration in development    |
| `pnpm prisma:deploy`   | Apply pending migrations (production)      |
| `pnpm prisma:studio`   | Open Prisma Studio                         |

## Structure

- `src/main.ts` — bootstrap (CORS, global `ValidationPipe`)
- `src/app.module.ts` — root module (env validation via `@rentos/shared`)
- `src/prisma/` — global `PrismaModule`/`PrismaService`
- `src/health/` — `GET /health`, includes a live database check
- `prisma/schema.prisma` — datasource + the `Tenant` model (multi-tenancy
  foundation; see root [README](../../README.md#database))

No business modules have been added yet — this is the application
infrastructure only.
