# .github

## Workflows

- [`workflows/ci.yml`](workflows/ci.yml) — runs on every push/PR to `main`:
  install, format check, lint, typecheck, apply Prisma migrations to an
  ephemeral Postgres service, run the test suite, then build.

Issue and pull request templates are not configured yet.
