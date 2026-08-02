# Contributing to RentOS

Thank you for contributing to RentOS. This document describes the conventions
used in this repository.

## Prerequisites

- Node.js >= 20
- pnpm (version pinned via `packageManager` in [package.json](package.json))

## Getting Started

```bash
pnpm install
```

## Project Structure

RentOS is a pnpm workspace managed with Turborepo. Application code lives
under `apps/*`, shared and reusable code lives under `packages/*`. See
[README.md](README.md) for the full layout.

## Architecture governance

Before starting any non-trivial change, read
[`docs/ARCHITECTURE_LOCK.md`](docs/ARCHITECTURE_LOCK.md). It defines
which architectural principles are locked, which areas are safe to
extend freely, which changes require a new ADR before implementation,
and which shortcuts are forbidden outright.

## Development Workflow

```bash
pnpm build        # Build all workspaces
pnpm lint          # Lint all workspaces
pnpm typecheck     # Type-check all workspaces
pnpm format        # Format the repository with Prettier
pnpm format:check  # Verify formatting without writing changes
```

Run the relevant commands above before opening a pull request and ensure
they all pass.

## Code Style

- TypeScript is used in **strict** mode across the repository; avoid `any`.
- Formatting is enforced by Prettier — do not hand-format code that
  conflicts with it.
- Linting is enforced by ESLint using the shared configuration in
  [`packages/config`](packages/config).
- Shared, reusable logic belongs in `packages/*`, not duplicated across
  apps.

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/) style
prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`) so that
history stays readable and machine-parseable.

## Pull Requests

- Keep pull requests focused on a single concern.
- Describe the change and its motivation clearly.
- Ensure the build, lint, and type-check scripts pass before requesting
  review.
