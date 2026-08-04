# UI Audit — Current Staff Application Shell

An evidence-based audit of the staff app shell as it exists today
(commit `594a6e0`), read directly from source — not assumed — before
any redesign work. Every finding below cites the exact file and, where
relevant, the exact grep/read that produced it. Compared against
[`BRAND_GUIDELINES.md`](BRAND_GUIDELINES.md),
[`UI_PATTERNS.md`](UI_PATTERNS.md), and
[`UX_PRINCIPLES.md`](UX_PRINCIPLES.md). See
[`UI_RESEARCH.md`](UI_RESEARCH.md) for the external reference points
and [`UI_REDESIGN_PLAN.md`](UI_REDESIGN_PLAN.md) for what Chapter 1
does about each finding below.

## Scope of this audit

The staff app shell: `apps/web/src/app/app/layout.tsx` plus the 28
page files it wraps (`apps/web/src/app/app/**`). The Customer Portal
shell (`apps/web/src/app/portal/(shell)/layout.tsx`) is **not** in
scope — it already implements several of the patterns this audit
finds missing from the staff shell (dark mode, notifications), and is
used below as an existing internal precedent to reuse rather than
reinvent.

## Structural findings

### 1. No sidebar — navigation is a single-row top bar

`apps/web/src/app/app/layout.tsx` renders one `<header>` containing a
flat `<nav>` of 9 text links (Customers, Assets, Rentals, Quotes,
Documents, then 4 settings sub-pages) with no grouping, no icons, no
active-state indicator at all — an active route is visually
indistinguishable from an inactive one today. Against
`UI_RESEARCH.md`'s finding #1 ("persistent sidebar is the primary nav
surface") and `UI_PATTERNS.md`'s own Sidebar pattern (already
specified, not yet built), this is the largest gap. As the product
grows past 7 top-level areas (TASK-0011 onward adds SaaS
plans/billing settings, TASK-0012 a public booking admin surface, and
so on), a single-row nav will not scale — it already wraps
awkwardly at moderate viewport widths since every item is always
rendered regardless of role (see finding #4).

### 2. No breadcrumbs, no reusable page-header pattern

No page in `apps/web/src/app/app/**` renders a breadcrumb trail.
Every list/detail page hand-writes its own `<h1>` + optional
`<p className="text-muted-foreground">` subtitle + action buttons
directly in JSX (e.g. `rentals/page.tsx:47-64`,
`customers/[id]/page.tsx`'s edit-form-as-page-header) — the same
layout shape repeated with zero code reuse. `UI_PATTERNS.md`'s
`PageHeader` pattern is specified but not implemented anywhere.

### 3. No command palette, no global search

Nothing resembling a `Cmd/Ctrl+K` surface exists. Per-page search
(e.g. `CustomersPage`'s search `Input`) is scoped to that one list
only — there is no way to jump to a specific record or page from
anywhere else in the product without using the sidebar/nav directly.

### 4. Zero `.view`/`.read` permission gating anywhere in the frontend — a real bug, not a style gap

Grepped every `usePermission(...)` call under `apps/web/src/app/app`:
55 calls exist, and **not one** checks a `.view` or `.read`
permission (`grep -rn "usePermission(\"[a-z_]*\.\(view\|read\)\")"`
returns zero matches). Every call gates a _mutating_ action
(`.create`, `.update`, `.delete`, `.manage`, `.reserve`, etc.) —
correct per `ARCHITECTURE_LOCK.md` 1.3, since the server independently
re-checks every mutation regardless. But **no nav link or page is
ever hidden or gated for a role that lacks read access to it**, which
directly violates `UX_PRINCIPLES.md` rule 17 ("permissions are
enforced by omission, not by disabling") for the _viewing_ case
specifically.

This is a concrete, reproducible bug, not a hypothetical: cross-
referencing `apps/api/src/permissions/permission.ts`'s
`ROLE_PERMISSIONS.TECHNICIAN` array — it contains no `quotes.*`
permission at all, meaning a `TECHNICIAN` user has neither
`quotes.view` nor any other quotes permission. The current nav
unconditionally renders a "Quotes" link
(`apps/web/src/app/app/layout.tsx:55-57`) to every authenticated
user regardless of role. A `TECHNICIAN` clicking it hits
`GET /tenants/:tenantId/quotes`, which `PermissionsGuard` rejects
with `403` — the frontend has no handling for this today (no
Permission Denied state exists per `UI_PATTERNS.md`'s own note that
this pattern isn't implemented yet), so the user lands on a broken,
error-only page for a link that should never have been shown to them.
The same gap applies to `TECHNICIAN` and `rental_settings.view` (also
absent from `TECHNICIAN`'s permission list, and the "Rental billing
settings" nav link is likewise shown unconditionally).

### 5. No dark mode, no theme toggle, for staff

The Customer Portal already has a working dark-mode toggle
(`apps/web/src/hooks/use-dark-mode.ts`, wired into
`apps/web/src/app/portal/(shell)/layout.tsx`). The staff shell has no
equivalent — `BRAND_GUIDELINES.md`'s full light+dark token system
(implemented for the whole product in `theme.css`) is simply unused
in dark mode by staff users today, since there's no control to
activate it.

### 6. No language switcher for staff

Six locales are fully implemented and parity-checked
(`packages/localization/src/locales/*/common.json`,
`scripts/check-i18n-parity.mjs`), but nothing in the staff shell lets
a user change their active language at runtime — `defaultLanguage` is
fixed at `i18n.ts` init time. (Out of scope to fully solve here — see
`UI_REDESIGN_PLAN.md` for what this chapter does vs. defers.)

### 7. No notifications surface for staff

The Customer Portal has a full notifications system
(`CustomerNotification` model, `PortalNotificationsService`,
`/portal/notifications` page). No equivalent exists for staff — no
model, no endpoint, no UI. This is a real product gap, not just a UI
one; see `UI_REDESIGN_PLAN.md` for why this chapter builds only the
UI architecture, not a new backend notification pipeline (which would
be a business-logic change outside a "UI shell redesign" task's
scope, per `ARCHITECTURE_LOCK.md`'s "no duplicated business logic" and
this task's own "without changing business behavior" instruction).

### 8. Dashboard is a stub

`apps/web/src/app/app/page.tsx` renders the logged-in user's name/
email and a link to `/app/select-tenant` — nothing else.
`ROADMAP.md`'s TASK-0010 entry already flags this ("a dedicated staff
dashboard does not exist today"); confirmed by direct read.

### 9. Tenant switching requires a full page navigation

`useSelectTenant`/`useTenants`/`useCurrentTenantId` already exist and
work (`apps/web/src/hooks/use-auth.ts`,
`apps/web/src/hooks/use-current-tenant.ts`) but are only exposed via
a dedicated `/app/select-tenant` page (`select-tenant/page.tsx`) — a
full navigation away from whatever the user was doing, not a
lightweight in-place switcher.

### 10. No `lucide-react` usage in `apps/web` yet

`grep -r lucide-react apps/web/src` returns zero matches, even though
`lucide-react` is already a dependency of `@rentos/ui` and is the
icon system `BRAND_GUIDELINES.md` names as the single chosen icon
philosophy. Every icon this chapter introduces should be the first
real usage of it in the web app — confirming there's no second icon
system to reconcile against.

## What already meets the bar (do not rebuild)

- **`@rentos/ui`'s five primitives** (`Button`, `Input`, `Label`,
  `Card`, `Alert`) are token-correct after the brand-system commit
  (`594a6e0`) and should be reused, not forked, by every new shell
  component.
- **The Customer Portal shell** already correctly implements dark
  mode (`use-dark-mode.ts`), a sticky/backdrop-blur header, and a
  notifications list UI — all three are direct, provable precedents
  for Chapter 1 to reuse rather than reinvent (see
  `UI_COMPONENT_INVENTORY.md` for the exact reuse mapping).
- **Permission-gated mutating actions** (buttons, forms) are correctly
  implemented everywhere already — this audit found no violation of
  `ARCHITECTURE_LOCK.md` 1.10 for write actions, only for the
  navigation-visibility gap described in finding #4.
- **The pagination, table, and card conventions** already in use
  across list pages are structurally consistent with each other (same
  `{ items, total, page, pageSize }` shape, same Previous/Next
  pattern) even though they're not yet extracted into shared
  components — see `UI_COMPONENT_INVENTORY.md`.

## Summary table

| Area                      | Current state                                     | Target (see `UI_REDESIGN_PLAN.md`)                     |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| Navigation                | Flat top-bar link list, no icons, no active state | Collapsible sidebar, icons, active indicator           |
| Breadcrumbs               | None                                              | Route-registry-driven, responsive                      |
| Page headers              | Hand-written per page, inconsistent               | Shared `PageHeader` component                          |
| Search                    | Per-list only                                     | Unified global search + command palette (foundation)   |
| Permission-aware nav      | Not implemented (real 403 bug for TECHNICIAN)     | Every nav item gated on its `.view`/`.read` permission |
| Dark mode (staff)         | Not available                                     | Reuses portal's `use-dark-mode.ts`                     |
| Language switcher (staff) | Not available                                     | Foundation added to user menu                          |
| Notifications (staff)     | Not available (no backend either)                 | UI architecture only, honestly empty                   |
| Dashboard                 | Stub                                              | Out of scope for Chapter 1 (shell only) — see plan     |
| Tenant switcher           | Full-page navigation                              | In-header dropdown, reusing existing hooks             |
