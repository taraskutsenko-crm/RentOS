# @rentos/web

RentOS web application — Next.js (App Router), TypeScript, TailwindCSS v4,
consuming `@rentos/ui`, `@rentos/shared`, and `@rentos/localization`.

## Scripts

| Script           | Description                                        |
| ---------------- | -------------------------------------------------- |
| `pnpm dev`       | Start the Next.js dev server                       |
| `pnpm build`     | Production build (`output: standalone` for Docker) |
| `pnpm start`     | Run the production build                           |
| `pnpm lint`      | ESLint (shared preset + Next.js rules)             |
| `pnpm typecheck` | `tsc --noEmit`                                     |
| `pnpm test`      | Component tests (Vitest + React Testing Library)   |

## Structure

- `src/app/page.tsx` — landing page
- `src/app/register/`, `src/app/login/` — auth pages (React Hook Form + Zod)
- `src/app/app/` — protected shell (`layout.tsx` verifies the session via
  `GET /auth/me`, redirects to `/login` on failure), `select-tenant/` for
  the tenant switcher
- `src/proxy.ts` — lightweight cookie-presence redirect for `/app/*`
  (UX only — the API is the real security boundary)
- `src/hooks/use-auth.ts` — TanStack Query hooks wrapping the auth/tenant API
- `src/lib/i18n.ts` — i18next setup, resources from `@rentos/localization`
- `test/` — component tests, auth hooks mocked (see `docs/api.md` for the
  real contract they mock against)

No business pages/features have been added yet.
