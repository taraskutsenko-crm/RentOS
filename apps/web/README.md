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
  the tenant switcher, `customers/` for the first business module (list
  with search/filter/pagination, `new/`, `[id]/` edit)
- `src/proxy.ts` — lightweight cookie-presence redirect for `/app/*`
  (UX only — the API is the real security boundary)
- `src/hooks/use-auth.ts`, `use-customers.ts` — TanStack Query hooks
  wrapping the API; `use-current-tenant.ts` persists the selected tenant
  (client-side convenience only, not a security boundary)
- `src/lib/i18n.ts` — i18next setup, resources from `@rentos/localization`
- `test/` — component tests, hooks mocked (see `docs/api.md` for the real
  contract they mock against)

No other business modules (assets, rentals, billing) have been added yet.
