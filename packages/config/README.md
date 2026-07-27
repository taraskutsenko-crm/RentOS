# @rentos/config

Shared, non-published configuration consumed by every workspace in RentOS:

- `tsconfig.base.json` — strict TypeScript compiler options extended by every app and package.
- `eslint-preset.mjs` — shared ESLint flat config, extended by the repo root and, later, by
  individual apps/packages that need framework-specific rules on top.

This package has no runtime code. It exists purely to keep tooling configuration
consistent and DRY across the monorepo.
