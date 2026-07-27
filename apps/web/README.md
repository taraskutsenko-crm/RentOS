# @rentos/web

RentOS web application — Next.js (App Router), TypeScript, TailwindCSS v4,
consuming `@rentos/ui` and `@rentos/shared`.

## Scripts

| Script           | Description                                        |
| ---------------- | -------------------------------------------------- |
| `pnpm dev`       | Start the Next.js dev server                       |
| `pnpm build`     | Production build (`output: standalone` for Docker) |
| `pnpm start`     | Run the production build                           |
| `pnpm lint`      | ESLint (shared preset + Next.js rules)             |
| `pnpm typecheck` | `tsc --noEmit`                                     |

No business pages/features have been added yet — this is the application
shell only.
