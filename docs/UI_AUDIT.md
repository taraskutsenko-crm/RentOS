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

## Addendum — Authentication screens (TASK-0010 Part 2 Chapter 2)

Scope extended for Chapter 2: the five real account-entry pages
(`/login`, `/register`, `/app/select-tenant`, `/portal/login`,
`/portal/invite/[token]`) plus two capabilities named in Chapter 2's
brief that were checked against the actual codebase, not assumed.

### 11. No shared auth layout — five independently duplicated pages

Every one of the five pages above independently wraps its content in
`<main className="flex min-h-screen items-center justify-center
p-8">` plus a `Card`/`CardHeader`/`CardTitle`/`CardDescription`
directly imported from `@rentos/ui` — verbatim-duplicated boilerplate,
zero shared `AuthShell`/`AuthCard` component, confirmed by reading all
five files directly. See `UI_REDESIGN_PLAN.md` Chapter 2 for what
replaces this.

### 12. No password-visibility toggle anywhere

Every password `Input` across all five pages is hardcoded
`type="password"` with no way to verify what was typed before
submitting — a real error-prevention gap per `UX_PRINCIPLES.md` rule
26, not present in any auth form today (`grep -rn "showPassword\|Eye"
apps/web/src/components/{auth,portal}` returns zero matches).

### 13. Staff invitation into an existing tenant — does not exist (product gap, not a UI gap)

Confirmed via exhaustive grep across `apps/api/src` (`inviteStaff`,
`invite-staff`, `MembershipInvitation`, `StaffInvitation`) and
`apps/web/src`: zero matches. Staff can only join a tenant via
`POST /auth/register`, which always creates a **brand-new** tenant
with the registering user as `OWNER` — there is no mechanism today for
an existing `OWNER`/`ADMIN` to invite a colleague into their own
tenant. This is a genuine backend/business-logic gap, out of Chapter
2's presentation-only scope (`ARCHITECTURE_LOCK.md` §3 — building it
would mean new endpoints, a new model, and permission wiring, not a UI
change). Not fabricated in Chapter 2; documented here for whichever
future task adds it.

### 14. Password recovery — does not exist on either auth stack

Confirmed via exhaustive grep for `reset`/`forgot`/`PasswordReset`
(case-insensitive) across `apps/api/src`, `apps/web/src`, and
`packages/localization`: zero matches on staff or customer-portal
auth. No `forgot-password` link, no reset endpoint, no i18n
scaffolding exists anywhere. Same reasoning as finding #13 — a real
backend capability gap, not built in Chapter 2, and not silently
faked as frontend-only behavior.

## Addendum — Data views (TASK-0010 Part 2 Chapter 3)

Scope extended for Chapter 3: every list/table page in
`apps/web/src/app/app/**` and `apps/web/src/app/portal/(shell)/**`.
Findings below are evidence-based (a full read of the five biggest
list pages plus a repo-wide grep for table-adjacent components),
not assumed.

### 15. Seven list pages are ~95% copy-pasted boilerplate

`rentals/page.tsx`, `quotes/page.tsx`, `documents/page.tsx`,
`documents/templates/page.tsx`, `customers/page.tsx`,
`portal/(shell)/rentals/page.tsx`, and `portal/(shell)/documents/page.tsx`
each independently hand-roll the identical shape: a local
`useState(1)` page counter, a local search/status `useState` pair, a
native `&lt;table&gt;` inside `Card`/`CardContent`, three fake skeleton
`&lt;div&gt;`s for loading, a `&lt;p&gt;` for the empty state, and a
hand-rolled Previous/Next pagination footer. No shared `Table`,
`Pagination`, `SearchInput`, or `FilterBar` component exists anywhere
in `packages/ui` or `apps/web/src/components` — confirmed by a direct
search of both directories. `assets/page.tsx` (229 lines) is the one
outlier with a more advanced pattern (see finding #17).

### 16. No sorting UI exists anywhere except one non-standard case

`rentals`' list hook (`use-rentals.ts`) already accepts and forwards
`sortBy`/`sortDirection` params to the API, but `rentals/page.tsx`
never sets them — the capability is wired end-to-end at the data
layer and simply unused by the UI. `assets/page.tsx` is the only page
with any sort control at all, and it's a combined
`sortBy:sortDirection` `&lt;select&gt;` (e.g. "Name A→Z"), not
click-to-sort column headers. No page anywhere has the
click-a-column-header-to-sort pattern `UI_RESEARCH.md`'s new finding
#14 identifies as the clearer standard.

### 17. No row selection, no bulk actions, anywhere

Zero checkboxes, zero "select all," zero bulk-action toolbar exist in
any list page today (`app/**` or `portal/**`) — this is a genuinely
new capability for Chapter 3 to add, not a migration of existing
behavior. Consequently, no bulk-delete/bulk-status-change/bulk-export
API usage pattern exists to preserve either; Chapter 3's bulk actions
must be built as client-side orchestration over each entity's
existing single-record endpoint (e.g. N sequential `DELETE` calls for
N selected rows), never a new bulk endpoint — `ARCHITECTURE_LOCK.md`
forbids new backend surface area for a presentation-layer chapter.

### 18. Row actions are inline buttons, never an overflow menu

Every list page renders 1-2 inline `Button`/link elements in the last
table column (customers is the only page with two: Edit + Delete).
`DropdownMenu` (built in Chapter 1) is never used for row actions
anywhere — confirmed by grep. This is the direct gap
`UI_RESEARCH.md` finding #12 addresses.

### 19. Only Assets has any responsive/mobile table treatment

`assets/page.tsx` is the sole list page with a real mobile layout: a
desktop-only `&lt;table className="hidden ... sm:table"&gt;` paired with a
separate `sm:hidden` stacked-card list. Every other list page
(rentals, quotes, documents, templates, customers, portal rentals,
portal documents, and all three settings tables) renders one
unguarded `&lt;table&gt;` with no responsive breakpoint and no
`overflow-x-auto` wrapper — it will visibly overflow on a narrow
viewport today.

### 20. `window.confirm`/`window.alert` remain the only confirmation mechanism

10 call sites across 9 files (customers, rentals, quotes, documents,
assets, and all three asset-settings pages) still use
`window.confirm(...)` for destructive actions and `window.alert(...)`
for failure feedback, even though a real `Dialog` component has
existed in `@rentos/ui` since Chapter 1 — this was already noted as a
stopgap in `HANDOVER.md`'s "Important frontend conventions" and
remains unaddressed until Chapter 3.

### 21. No shared pagination/table i18n namespace — a misplaced "shared" key in active use today

There is no `common.pagination.*` or `common.table.*` key namespace.
Instead, every non-customer list page calls `t("customer.previous")`/
`t("customer.next")` for its own Previous/Next buttons — a
`customer`-namespaced key pressed into service as a de facto shared
one, confirmed by direct inspection of `en/common.json` and every
list page's JSX. Search placeholder, status-filter option labels, and
empty-state copy are each independently duplicated per module
(`rental.searchPlaceholder`, `quote.searchPlaceholder`,
`document.searchPlaceholder`, …) rather than sharing one parameterized
key.

## Addendum — Dashboard (TASK-0010 Part 2 Chapter 4)

Scope extended for Chapter 4: the staff dashboard
(`apps/web/src/app/app/page.tsx`) and the customer portal dashboard
(`apps/web/src/app/portal/(shell)/dashboard/page.tsx`), plus every
backend data source either page could legitimately draw on. Findings
below are evidence-based (full reads of both page files, the only
dashboard backend that exists anywhere, every candidate hook, and a
repo-wide grep for "Dashboard"/audit/signature-request read paths),
not assumed.

### 22. The staff dashboard is a genuine stub — one link, no widgets

`apps/web/src/app/app/page.tsx` (26 lines) renders a `PageHeader` and
a single "Select tenant" link. Its only data fetch is `useMe()`
(identity only). No stat cards, no recent-activity panel, no quick
actions, no loading/skeleton/empty states — there is nothing to
migrate, only to build. This is the direct target of Chapter 4's
biggest single change.

### 23. No staff-side dashboard backend exists at all

A repo-wide grep for `Dashboard` under `apps/api/src` returns exactly
3 files, all inside `apps/api/src/customer-portal/dashboard/` — there
is no staff-facing dashboard controller, service, or aggregation
endpoint anywhere. `PortalDashboardController`/`PortalDashboardService`
(`GET /portal/dashboard`) exist only for authenticated customers via
`CustomerAuthGuard`; staff sessions (`TenantGuard`) cannot call it and
it is scoped to a single customer's own data (`customer.id`) even if
they could. Every staff-dashboard metric in this chapter must
therefore be derived client-side from existing staff list endpoints
(`useCustomers`/`useAssets`/`useRentals`/`useQuotes`/`useDocuments`,
each already returning `{ items, total, page, pageSize }`) rather than
from any single aggregation call — confirmed as the only
architecturally sound option that adds no new endpoint.

### 24. The portal dashboard duplicates ad hoc `Card`/table markup with no shared component and no skeleton

`apps/web/src/app/portal/(shell)/dashboard/page.tsx` is real and
functional (five stat cards + a recent-rentals table sourced from
`usePortalDashboard()`), but: its stat-card grid
(`grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5`) and each
`Card`/`CardContent` stat block are hand-written inline, matching no
shared component; its "Recent rentals" panel is a raw `<table>`
(never the shared `DataTable` built in Chapter 3, and not expected to
be — a 5-row preview isn't a paginated list); and its loading/error
states are a single page-level `<p>{t("common.loading")}</p>` /
`<p>{t("common.error")}</p>` — no `Skeleton` usage anywhere, unlike
`DataTable`'s per-column skeleton rows from Chapter 3. This is the
closest existing precedent for dashboard layout in the product, but
itself has the exact duplication and missing-skeleton gaps Chapter 4's
shared components are meant to eliminate — see `UI_RESEARCH.md`
finding #20 for why per-widget (not page-level) loading states are the
correct target.

### 25. Two real staff-side portal-management endpoints exist with working hooks but are wired into zero UI

`GET /tenants/:tenantId/extension-requests` and
`GET /tenants/:tenantId/damage-reports` (both
`StaffPortalController`, gated `customers.portal.manage`) are real,
tested endpoints with working frontend hooks
(`useStaffExtensionRequests`, `useStaffDamageReports` in
`apps/web/src/hooks/use-customer-portal.ts`) — confirmed via
`grep -rln "useStaffExtensionRequests\|useStaffDamageReports"
apps/web/src/app`, which returns zero matches. No page anywhere
surfaces these. Chapter 4 can legitimately surface their real counts
(pending extension requests, submitted-but-unreviewed damage reports)
as a permission-gated dashboard stat without inventing anything —
documented as the chapter's answer to "upcoming tasks (only if real
data exists)" in `UI_REDESIGN_PLAN.md`.

### 26. No audit-log read endpoint — a unified "recent activity" feed cannot be built

`AuditService` (`apps/api/src/audit/`) only exposes a write path
(`log()`, called by other services) — no controller, no `find`/`list`
method, confirmed by grep. There is no way to query "everything that
changed recently across rentals/quotes/documents/customers" without a
new endpoint, which this chapter's own scope forbids
(`ARCHITECTURE_LOCK.md` §3). Chapter 4 documents this as a limitation
rather than fabricating a merged feed — see `UI_RESEARCH.md` finding
#19.

### 27. No tenant-wide "documents awaiting signature" list endpoint

`DocumentSignatureController` (`apps/api/src/documents/signature/`) is
scoped per-document only — `GET
/tenants/:tenantId/documents/:id/signature-requests` requires a
specific document `id`; there is no
`GET /tenants/:tenantId/documents/signature-requests` (or equivalent)
that lists pending signatures across every document. A "documents
awaiting signature" KPI is therefore not buildable without a new
endpoint and is documented as a gap in `UI_REDESIGN_PLAN.md`, not
built.

### 28. No charting library installed; no chart-shaped data exists

`apps/web/package.json`'s dependency list has no charting library
(no recharts/chart.js/visx/d3/nivo/victory — confirmed by direct
read). This matches `UI_PATTERNS.md`'s own pre-existing "Charts"
pattern entry, already marked "Not yet implemented anywhere in the
product... TASK-0016." Chapter 4 does not add a charting dependency or
invent chart data, per its own explicit "if no chart data exists,
document the limitation" instruction.

## Summary table

| Area                      | Current state                                                           | Target (see `UI_REDESIGN_PLAN.md`)                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Navigation                | Flat top-bar link list, no icons, no active state                       | Collapsible sidebar, icons, active indicator                                                                                       |
| Breadcrumbs               | None                                                                    | Route-registry-driven, responsive                                                                                                  |
| Page headers              | Hand-written per page, inconsistent                                     | Shared `PageHeader` component                                                                                                      |
| Search                    | Per-list only                                                           | Unified global search + command palette (foundation)                                                                               |
| Permission-aware nav      | Not implemented (real 403 bug for TECHNICIAN)                           | Every nav item gated on its `.view`/`.read` permission                                                                             |
| Dark mode (staff)         | Not available                                                           | Reuses portal's `use-dark-mode.ts`                                                                                                 |
| Language switcher (staff) | Not available                                                           | Foundation added to user menu                                                                                                      |
| Notifications (staff)     | Not available (no backend either)                                       | UI architecture only, honestly empty                                                                                               |
| Dashboard                 | Staff: stub. Portal: real but ad hoc, no shared components, no skeleton | Chapter 4 — shared `DashboardCard`/`DashboardMetric`/etc., real KPIs from existing endpoints, both pages reuse the same components |
| Tenant switcher           | Full-page navigation                                                    | In-header dropdown, reusing existing hooks                                                                                         |
