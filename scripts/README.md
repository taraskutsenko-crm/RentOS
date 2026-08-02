# Scripts

Repository automation and governance safeguards. See
[`docs/ARCHITECTURE_LOCK.md`](../docs/ARCHITECTURE_LOCK.md) and
[`docs/DECISIONS.md`](../docs/DECISIONS.md) (D-040) for the rationale.

- `check-i18n-parity.mjs` — fails if the six locale JSON files under
  `packages/localization/src/locales/` don't carry identical key
  structure. Run: `pnpm check:i18n-parity`.
- `check-permission-sync.mjs` — fails if
  `apps/api/src/permissions/permission.ts` and
  `apps/web/src/lib/permissions.ts` diverge in their permission set or
  role map. Parses real TypeScript ASTs, not regex. Run:
  `pnpm check:permission-sync`.
- `check-doc-links.mjs` — fails if a markdown file under `docs/` (or
  the root `README.md`/`CONTRIBUTING.md`) links to a local file that
  doesn't exist. Does not validate in-page anchors. Run:
  `pnpm check:doc-links`.
- `governance-checks.test.mjs` — unit tests for the three scripts
  above (positive path against the real repo, negative path against
  injected fixtures). Run: `pnpm test:governance-checks`.

Run all three checks together: `pnpm check:governance`. All four are
wired into CI (`.github/workflows/ci.yml`).
