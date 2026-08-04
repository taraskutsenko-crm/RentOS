# UI Component Inventory

A catalog of every existing UI building block as of commit `594a6e0`,
before TASK-0010 Part 2's shell redesign. Read directly from source —
see [`UI_AUDIT.md`](UI_AUDIT.md) for the findings this inventory feeds
into and [`UI_REDESIGN_PLAN.md`](UI_REDESIGN_PLAN.md) for what gets
built on top of it.

## Shared primitives (`packages/ui/src/components/`)

| Component                                                                              | File         | Notes                                                                                                                                                    |
| -------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                                                                               | `button.tsx` | `cva`-based variants (`default`/`destructive`/`outline`/`secondary`/`ghost`/`link`) × sizes (`default`/`sm`/`lg`/`icon`). Token-correct after `594a6e0`. |
| `Input`                                                                                | `input.tsx`  | Native `<input>` wrapper, `aria-invalid` styling, disabled state.                                                                                        |
| `Label`                                                                                | `label.tsx`  | Native `<label>` wrapper.                                                                                                                                |
| `Card` / `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter` | `card.tsx`   | Plain composable div wrappers.                                                                                                                           |
| `Alert` / `AlertDescription`                                                           | `alert.tsx`  | `default`/`destructive` variants only — no `success`/`warning`/`info` variant exists yet despite those tokens existing in `theme.css` since `594a6e0`.   |

**Not yet built in `@rentos/ui`**, despite being specified in
`UI_PATTERNS.md`: `Table`, `Dialog`, `DropdownMenu`, `Tabs`,
`DatePicker`, `Skeleton`, `Toast`, `Tooltip`, `Sidebar`,
`Breadcrumbs`, `PageHeader`, `CommandPalette`. This chapter builds the
subset the Application Shell needs (`Sidebar`, `Breadcrumbs`,
`PageHeader`, a minimal `DropdownMenu`, `CommandPalette`) as real,
shared `@rentos/ui` components — not page-local one-offs — per
`ARCHITECTURE_LOCK.md`'s "no duplicated logic" and this document's own
"never create one-off UI" instruction.

## Per-page patterns (not yet shared components)

Every list page (`customers/page.tsx`, `assets/page.tsx`,
`rentals/page.tsx`, `quotes/page.tsx`, `documents/page.tsx`,
`documents/templates/page.tsx`) independently hand-writes:

- A `page-1`/`useState` pagination pair + Previous/Next buttons —
  **identical shape across all six pages**, a strong signal this
  should become a shared hook/component in a later chapter (not this
  one — Chapter 1 is shell-only, see the plan).
- A `<table>` with the same `border-b`/`p-3` cell styling repeated
  literally (not extracted).
- A skeleton-row loading state (`bg-muted h-10 animate-pulse
rounded-md`) — already consistent across pages by convention, good
  evidence this specific pattern is ready to extract later.
- A hand-written `<h1>` + subtitle + action-button row at the top of
  the page — the exact shape `UI_PATTERNS.md`'s `PageHeader` pattern
  specifies, currently duplicated 6+ times.

Every detail page (`customers/[id]`, `rentals/[id]`, `quotes/[id]`,
`documents/[id]`, `assets/[id]`) independently hand-writes:

- The same `<h1>` + status/subtitle + action-button-row header shape.
- The same `border-l-2 pl-3` timeline entry styling (already
  consistent, a good sign it's ready for a shared `Timeline` component
  later).
- The same `InfoRow` label/value helper component, **redefined
  per-file** (e.g. `rentals/[id]/page.tsx` and
  `assets/[id]/page.tsx` each define their own local `InfoRow`
  function with identical implementations) — a clear, low-risk
  extraction candidate for a later chapter.

Wizards (`RentalWizard`, `QuoteWizard` under
`apps/web/src/components/{rentals,quotes}/`) already share one
architecture (step-index + React Hook Form + `useState` items array)
even though they're separate components — consistent with
`PRODUCT_PRINCIPLES.md`'s existing "Consistent design system"
principle; no changes needed here for Chapter 1.

## The Customer Portal shell — existing precedent to reuse

`apps/web/src/app/portal/(shell)/layout.tsx` and its supporting hooks
already solve several problems this chapter needs solved for staff:

| Portal implementation                              | File                                                                                            | Reused as-is for staff shell?                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useDarkMode()` hook                               | `hooks/use-dark-mode.ts`                                                                        | **Yes** — imported directly, not forked. Its `localStorage` key (`rentos_portal_dark_mode`) is portal-specific; the staff shell needs its own key, so a small shared factory or a second thin hook reusing the same `useSyncExternalStore` shape is added (see `UI_REDESIGN_PLAN.md`) — the _mechanism_ is reused, the _storage key_ is intentionally separate so a user's staff-side and portal-side theme preferences don't collide if they're ever the same person in two tabs. |
| Sticky header + backdrop blur                      | `layout.tsx`'s `<header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur">` | **Yes** — identical Tailwind shape reused for the staff header.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Unread-count badge on a nav icon                   | `layout.tsx`'s notification badge span                                                          | **Yes** — the exact same badge shape is reused for the staff Notifications bell placeholder, even though the staff badge count is always `0` today (no backend — see `UI_AUDIT.md` finding #7).                                                                                                                                                                                                                                                                                    |
| `usePortalUnreadNotificationCount` polling pattern | `hooks/use-portal-notifications.ts`                                                             | **Not reused as-is** — it queries a real endpoint that only exists for customers. The staff placeholder does not invent a fake endpoint to poll; see `UI_REDESIGN_PLAN.md`.                                                                                                                                                                                                                                                                                                        |

## Existing hooks available for shell reuse (no new backend calls needed)

- `useMe()`, `useLogout()`, `useTenants()`, `useSelectTenant()`
  (`hooks/use-auth.ts`) — user identity, tenant list, tenant
  switching.
- `useCurrentTenantId()` (`hooks/use-current-tenant.ts`) — client-side
  "which tenant is selected" state (explicitly not a security
  boundary, per its own doc comment).
- `useCurrentTenantRole()`, `usePermission(permission)`
  (`hooks/use-current-tenant-role.ts`) — the exact mechanism this
  chapter uses to fix `UI_AUDIT.md` finding #4 (permission-aware nav).
- `apps/web/src/lib/permissions.ts`'s `ALL_PERMISSIONS`/
  `ROLE_PERMISSIONS` — used to build the nav registry's per-item
  permission requirement in code, not duplicated as a second list.

## Icons

`lucide-react` is an existing `@rentos/ui` dependency, zero current
usage in `apps/web` (`UI_AUDIT.md` finding #10) — this chapter is the
first real consumer, per `BRAND_GUIDELINES.md`'s "chosen icon
philosophy: Lucide" section.

## Localization

`packages/localization/src/locales/{en,ru,uk,de,pl,es}/common.json`
already has `nav.logout`/`nav.selectTenant` and a `portal.nav.*` block
this chapter's staff nav can follow the same structural convention as
(new `app.nav.*`/`app.shell.*` keys, verified via
`scripts/check-i18n-parity.mjs` across all six languages before
commit).
