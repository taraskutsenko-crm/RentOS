# UI Redesign Plan — TASK-0010

The phased plan for TASK-0010 (Complete UI/UX Redesign), building on
[`UI_RESEARCH.md`](UI_RESEARCH.md), [`UI_AUDIT.md`](UI_AUDIT.md), and
[`UI_COMPONENT_INVENTORY.md`](UI_COMPONENT_INVENTORY.md). Every
chapter below must be verified (gates, Docker/browser, CI) and
documented before the next one starts — see
[`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md)'s future-task contract.

## Chapter 1 — Application Shell (this chapter)

**Scope:** the staff app's persistent chrome — Sidebar, Header,
Breadcrumbs, `PageHeader` component, global search + command palette
foundation, notifications placeholder, user menu, tenant switcher,
quick create, responsive/keyboard/dark-mode behavior for all of the
above. **Not in scope:** the dashboard's actual content, redesigning
any individual list/detail page's body content beyond adopting
`PageHeader` on a representative sample, authentication pages
(login/register), or the Customer Portal shell (already compliant —
see `UI_AUDIT.md`).

### Design decisions (the "Design Rationale" required before implementation)

1. **Sidebar over top-bar nav.** `UI_RESEARCH.md` finding #1 and
   `UI_AUDIT.md` finding #1 agree: a flat top-bar link list doesn't
   scale past Havelio's current 7 top-level areas, has no
   active-state indication, and directly contradicts
   `UI_PATTERNS.md`'s already-specified Sidebar pattern. Decision:
   replace the top-bar nav with a collapsible left sidebar; keep a
   slim header above the content area for breadcrumbs/search/account
   controls, per the same split every product in `UI_RESEARCH.md`
   uses.

2. **Fix the permission-gating bug while redesigning nav, not as a
   separate task.** `UI_AUDIT.md` finding #4 is a real, reproducible
   403-behind-a-visible-link bug (`TECHNICIAN` + Quotes/rental billing
   settings). Since the nav is being rebuilt anyway, each nav item's
   permission requirement is declared once in a nav registry and
   checked via the existing `usePermission()` hook — no new
   permission strings, no backend change, pure frontend-visibility
   fix consistent with `UX_PRINCIPLES.md` rule 17.

3. **Unify Global Search and Command Palette into one surface.**
   `UI_RESEARCH.md`'s GitHub/Notion notes and Havelio's own
   `UI_PATTERNS.md` (which already treats these as closely related)
   agree this should be one `Cmd/Ctrl+K` modal, not two competing
   ones. Decision: one `CommandPalette` component; "global search"
   _is_ its default mode (typing filters navigable pages by name
   today; the seam for searching real records — customers, rentals,
   etc. — is typed and structured but not wired to real data yet,
   since that requires new list-search API calls this chapter doesn't
   scope).

4. **Notifications: UI architecture only, honestly empty.**
   `UI_AUDIT.md` finding #7 — no staff notification backend exists.
   Building one is a business-logic/schema change
   (`ARCHITECTURE_LOCK.md` 1.12) out of proportion to a UI shell
   chapter that must not change business behavior. Decision: a real,
   fully-styled `NotificationsMenu` component (bell, badge, panel,
   grouped-by-day layout, read/unread visual states) rendering an
   empty "You're all caught up" state unconditionally today, with the
   data-fetching hook's shape typed and ready for a real endpoint —
   never a fake/mocked notification shown as if real.

5. **Dark mode: reuse the mechanism, not the storage key.**
   `UI_COMPONENT_INVENTORY.md` — `useDarkMode()`'s
   `useSyncExternalStore` + `localStorage` shape is copied verbatim as
   a tiny parameterized hook (`use-dark-mode.ts` gains a `storageKey`
   parameter, portal and staff each pass their own key) rather than
   forked into two near-duplicate files — keeps exactly one
   implementation per `ARCHITECTURE_LOCK.md` 1.4, while keeping a
   staff user's and a portal customer's theme preference independent
   (they can legitimately be the same physical person in two tabs).

6. **Tenant switcher moves into the header, `/app/select-tenant`
   stays as-is.** The page remains (it's the correct experience for a
   user with zero tenants selected yet, e.g. right after registration
   accepting an invite to a second tenant), but once a tenant is
   already selected, switching no longer requires leaving the current
   page — a header dropdown reuses the exact same
   `useTenants`/`useSelectTenant` hooks.

7. **`PageHeader` is a real shared component, applied to a
   representative sample this chapter, not every page.**
   Retrofitting all 28 pages is significant, low-risk-but-large
   mechanical work better scoped to its own future chapter (see
   below) once the component's shape is proven correct on a few real
   pages first (Dashboard, Customers list, Rentals list, Rentals
   detail — one list and one detail page, plus the redesigned
   Dashboard). This avoids a single giant, hard-to-review commit.

### What Chapter 1 builds

- `@rentos/ui`: `DropdownMenu` (a minimal, accessible menu primitive —
  needed by the user menu, tenant switcher, and quick-create control),
  `Skeleton` (already specified in `UI_PATTERNS.md`, needed by the new
  header's loading state).
- `apps/web/src/hooks/use-dark-mode.ts` — generalized with a
  `storageKey` parameter (breaking change to its one existing caller,
  the portal shell, updated in the same commit).
- `apps/web/src/lib/nav-registry.ts` — the single source of truth for
  top-level nav items, each with its route, i18n label key, icon, and
  required permission (or `null` for permission-less items like
  Customers/Dashboard).
- `apps/web/src/components/shell/sidebar.tsx`,
  `breadcrumbs.tsx`, `page-header.tsx`, `command-palette.tsx`,
  `notifications-menu.tsx`, `tenant-switcher.tsx`, `user-menu.tsx`,
  `quick-create.tsx`.
- `apps/web/src/app/app/layout.tsx` rebuilt around the above.
- `apps/web/src/app/app/page.tsx` — minimally adopts `PageHeader`
  (its content stays a stub; a real dashboard is future work per
  `ROADMAP.md`'s TASK-0010 scope, not Chapter 1).
- Representative `PageHeader` adoption: Customers list, Rentals list,
  Rentals detail.
- New localization keys (`app.nav.*`, `app.shell.*`) across all six
  locales.

### What Chapter 1 explicitly defers

- Retrofitting `PageHeader` across all remaining 24 pages.
- Extracting the shared `Table`/`InfoRow`/pagination patterns
  `UI_COMPONENT_INVENTORY.md` identifies as ready — real work, but a
  separate, independently-reviewable chapter.
- A real staff notifications backend.
- A real dashboard (widgets, metrics).
- A language switcher's actual runtime language-change wiring beyond
  the UI control existing in the user menu (today's `i18n.ts` sets
  the language once at init from the tenant's `defaultLanguage`;
  wiring a live switch is a small but distinct change intentionally
  left to whichever future chapter revisits the dashboard/account
  settings, to keep this chapter's diff reviewable).
- Authentication pages (explicitly excluded by this task's own
  instructions).

## Chapter 2 — Premium Authentication Experience

**Scope:** the presentation layer of every real account-entry
screen — staff login, staff registration/tenant onboarding, tenant
selection, customer-portal login, customer-portal invitation
activation — unified under shared `apps/web/src/components/auth/`
primitives. **Not in scope:** any change to authentication
architecture, JWT/cookie strategy, RBAC, password hashing, or API
contracts (all locked by `ARCHITECTURE_LOCK.md` §3); the application
shell (Chapter 1, already complete); starting Chapter 3 or TASK-0011.

### Step 1 — Current implementation, read directly from source

Four real, working flows exist, each a fully independent inline
`Card` (`apps/web/src/app/{login,register}/page.tsx`,
`apps/web/src/app/portal/{login,invite/[token]}/page.tsx`) wrapped in
`<main className="flex min-h-screen items-center justify-center p-8">`
— the same boilerplate hand-duplicated four times with zero shared
component. A fifth, `/app/select-tenant`, is the same shape again and
is part of the same post-auth account-entry experience. Plus
`hooks/use-auth.ts` / `hooks/use-portal-auth.ts` (thin TanStack Query
wrappers), `lib/validation.ts` (Zod schemas, `passwordSchema` shared
between staff register and portal activate), `lib/api-error-i18n.ts`
(`apiErrorKey()` — staff, maps known messages to translation keys;
`apiErrorMessage()` — portal, shows the raw backend message with a
translated fallback).

**Two flows named in this chapter's brief do not exist anywhere in the
stack — confirmed by exhaustive grep across `apps/api/src`,
`apps/web/src`, and `packages/localization`, not assumed:**

- **Staff invitation into an existing tenant.** Staff only ever join a
  tenant by self-registering a brand-new one (`POST /auth/register`
  creates `User` + `Tenant` + `OWNER` membership atomically). There is
  no `MembershipInvitation` model, no send/accept endpoint, no
  frontend page, no i18n keys. Not fabricated here — see "What this
  chapter does not build" below.
- **Password recovery, staff or customer.** No `reset`/`forgot`
  endpoint, page, or i18n key exists on either auth stack. Not
  fabricated here.

**Concrete weaknesses of the current presentation** (not
architecture):

- Zero shared layout — a fix to spacing/branding/error-alert style
  requires editing four files identically, and the fifth
  (`select-tenant`) has already drifted (no error state for a failed
  `selectTenant.mutateAsync` at all, per the research pass).
- Every field is hand-written `Label`+`Input`+conditional-error JSX,
  duplicated 5–10 times per form — the exact `AuthField` extraction
  candidate `UI_COMPONENT_INVENTORY.md`'s "per-page patterns" section
  already names for other modules (`InfoRow`).
- No password-visibility toggle anywhere — every password field is
  `type="password"` with no way to verify what was typed, a real
  error-prevention gap per `UX_PRINCIPLES.md` rule 26 ("prevent a
  mistake before it happens").
- No brand presence beyond a plain `CardTitle` — a `<main>` with a
  centered white card and no color, wordmark treatment, or visual
  hierarchy reads as an unstyled framework starter, failing
  `BRAND_GUIDELINES.md`'s own test ("would this feel out of place next
  to Stripe's dashboard?").
- Inconsistent error-handling philosophy between the two stacks:
  staff maps every known message through `apiErrorKey()`
  (fully localized, six languages); portal shows the raw backend
  string via `apiErrorMessage()` with a translated fallback only for
  non-`ApiError` failures — meaning a real portal `ApiError` message
  (already generic/enumeration-safe per the backend's own copy, e.g.
  `"Invalid email, password, or company."`) bypasses the locale system
  entirely. Both are _safe_ (no enumeration either way), but only one
  is actually translated.
- No password-visibility, no `Enter`-to-submit issue exists already
  (native `<form onSubmit>` already handles it) — confirmed working,
  not a gap.
- Dark mode: every auth page inherits the global `.dark` class tokens
  (same `Card`/`Input`/`Alert` primitives the rest of the product
  uses) but has never been visually verified, since these pages sit
  outside both shells' dark-mode toggles (they render before login,
  so dark mode is inherited from `prefers-color-scheme` /
  `localStorage` state carried over, if any, from a prior session).
- Mobile: already single-column and responsive by accident (a
  `max-w-sm`/`max-w-lg` card centers fine at any width), but
  `register-form.tsx`'s `grid-cols-2`/`grid-cols-3` rows do not
  collapse to one column below `sm`, per `UI_PATTERNS.md`'s own
  documented Forms mobile behavior.
- Localization: fully parity-checked today (all six languages carry
  identical `auth.*`/`portal.auth.*`/`tenant.*` keys) — no gap here,
  only new keys need the same discipline extended.

### Step 2 — Compared against the governing docs

- `UI_RESEARCH.md` finding #7 (skeletons over spinners) and finding #8
  (motion is fast/purposeful) apply directly — the redesign uses the
  same `havelio-pop`/`havelio-fade` utilities Chapter 1 already built,
  not a new animation system.
- `UX_PRINCIPLES.md` rule 6 ("max 3 clicks to a common action") is
  already met (login is 1 screen, 1 click) — nothing to fix there;
  rule 20 ("success messages are specific, past tense") applies to the
  one genuine new-account moment (portal activation); rule 26
  ("prevent a mistake before it happens") is the direct justification
  for the password-visibility toggle.
- `BRAND_GUIDELINES.md`'s Motion System, color tokens, and "no
  gradients, no stock photography, no giant empty panels" rules
  directly shape the brand-panel decision below (a solid `Primary`
  or `Sidebar`-toned panel with restrained typography, never a
  decorative illustration or photo).
- `ARCHITECTURE_LOCK.md` §3 lists "changing authentication
  architecture" and "changing customer-portal authentication" as
  ADR-gated — nothing in this chapter proposes either; every change
  below is presentation-only, calling the exact same hooks/endpoints
  that exist today.

### Step 3 — Design Rationale

1. **One shared `AuthShell`, not five independent pages.** A
   two-region responsive layout — a `Primary`/`Sidebar`-toned brand
   panel (wordmark + one calm line of supporting copy, per
   `BRAND_GUIDELINES.md`'s "no giant empty panel with no purpose" —
   the panel's job is establishing brand and trust at a glance, not
   decoration) on the left, the actual card on the right — replaces
   every page's independent `<main className="flex min-h-screen
items-center justify-center p-8">`. The brand panel simplifies to a
   small top-of-card wordmark below `lg` rather than disappearing
   silently, so brand presence survives on mobile without stealing
   vertical space from the form. This directly fixes the "reads as an
   unstyled starter template" weakness and gives every future auth
   screen (password reset, once it exists) the same foundation for
   free.
2. **`AuthField`/`PasswordField` collapse ~40 duplicated field blocks
   into one component.** Same `htmlFor`/`aria-invalid`/error-beneath
   -field shape `UI_PATTERNS.md`'s Forms pattern already specifies,
   just finally extracted. `PasswordField` adds a visibility-toggle
   icon button (`Eye`/`EyeOff`, matching the icon-sizing/stroke rules
   `BRAND_GUIDELINES.md` already fixed for the shell) — a pure
   presentation addition, not a validation or security change (the
   value submitted is unaffected either way).
3. **`Alert` gains `success`/`warning`/`info` variants alongside its
   existing `default`/`destructive`.** `UI_COMPONENT_INVENTORY.md`
   already flagged this as a real gap ("no success/warning/info
   variant exists yet despite those tokens existing in `theme.css`").
   This chapter is the first place a calm, non-error confirmation
   (customer invitation activation) is needed, so the token-backed
   variant is added to the one shared `Alert` component — not a new
   one-off "auth success box" — per `ARCHITECTURE_LOCK.md`'s
   "no duplicated logic" applied to UI.
4. **Error-handling stays exactly as safe as it is today, made
   visually consistent.** Neither `apiErrorKey()` nor
   `apiErrorMessage()` is touched at the logic level — both already
   return enumeration-safe copy per the fact-finding above. The portal
   forms are changed to also route their `ApiError` messages through
   `apiErrorMessage()`'s existing fallback path presented via the same
   `AuthAlert` component the staff forms use, so a French/German/etc.
   user sees a translated string either way where one is available —
   a presentation consistency fix, not a new error-mapping mechanism.
5. **Two named flows are documented as gaps, not fabricated.** Per
   this chapter's own explicit instruction ("never assume a flow
   exists merely because this prompt names it"): no staff-invitation
   UI and no password-recovery UI are built. `UI_AUDIT.md` records
   both as findings (see the addendum below) so a future chapter that
   _does_ add the backend capability has a ready-made presentation
   plan instead of starting from zero.
6. **`/app/select-tenant` adopts the same `AuthShell`/`AuthCard`.**
   It's part of the same "get from credentials to the app" experience
   (a user with more than one tenant sees it between login and the
   shell) and today visibly diverges from the other four pages'
   already-inconsistent styling — bringing it in line is a small,
   low-risk extension of the same primitives, not a new page.
7. **Customer portal keeps its own visual register within the shared
   shell.** Same `AuthShell` component, same tokens — but the portal's
   copy stays second-person/warmer (`portal.auth.*` keys already are)
   and its brand panel uses the softer `Sidebar` surface tone rather
   than a saturated `Primary` fill, consistent with
   `BRAND_GUIDELINES.md`'s "Customer Portal is slightly warmer, never
   less precise" voice rule — this is a copy/tone difference, not a
   second component tree.

### What this chapter builds

- `packages/ui`: `Alert` gains `success`/`warning`/`info` variants.
- `apps/web/src/components/auth/`: `auth-shell.tsx` (`AuthShell`,
  brand panel), `auth-card.tsx` (`AuthCard`, `AuthHeader`,
  `AuthFooter`), `auth-field.tsx` (`AuthField`, `PasswordField`),
  `auth-alert.tsx` (`AuthAlert`), `auth-success.tsx`
  (`AuthSuccessState`, used once — the portal invitation-activation
  welcome moment).
- Redesigned, using the above: `/login`, `/register`,
  `/app/select-tenant`, `/portal/login`, `/portal/invite/[token]`.
- New/updated localization keys across all six locales for any new
  copy (password-toggle `aria-label`s, the portal activation success
  message).

### What this chapter does not build (documented gaps, not fabricated)

- **Staff invitation into an existing tenant** — no backend capability
  exists; this is a genuine product gap (see `UI_AUDIT.md` addendum),
  scoped to a future task that adds the `MembershipInvitation`
  model/endpoints, at which point this chapter's `AuthShell`/
  `AuthCard`/`AuthField` primitives are the ready-made presentation
  layer for it.
- **Password recovery (staff or customer)** — same reasoning; no
  backend capability exists on either auth stack.
- **"Return to intended page" after login** — no `returnTo`/
  `redirectTo` capture exists anywhere in the codebase today (grep
  confirmed zero hits); adding one is routing/session-adjacent
  behavior beyond this chapter's pure-presentation scope, not a
  one-line style change, so it is documented here as a limitation
  rather than added speculatively.
- **OAuth, 2FA, social login, magic links** — explicitly forbidden by
  this chapter's own scope.

## Chapter 3 — Universal Data Views

**Scope:** one reusable `DataTable` system covering every data-heavy
staff screen — sorting, filtering, pagination, row selection, bulk
actions, column visibility, sticky header, responsive/mobile-card
layout, and every required state (loading, skeleton, empty,
permission-denied, error+retry) — replacing seven independently
hand-written list pages. Presentation-layer only, per
`ARCHITECTURE_LOCK.md` §3: no new backend endpoints, no schema
changes, no API contract changes. **Not in scope:** the application
shell (Chapter 1) or authentication (Chapter 2), both already
complete; starting Chapter 4 or TASK-0011.

### Step 1 — Current implementation, read directly from source

Seven list pages — `rentals`, `quotes`, `documents`,
`documents/templates`, `customers`, `portal/(shell)/rentals`,
`portal/(shell)/documents` — independently hand-write the identical
shape: a local `useState(1)` page counter, a local search/status
`useState` pair, a native `<table>` inside `Card`/`CardContent`,
three fake skeleton `<div>`s (the real `Skeleton` component from
Chapter 1 is never used), a `<p>` empty state, and a hand-rolled
Previous/Next footer that reuses the `customer.previous`/
`customer.next` i18n keys regardless of the page's actual entity.
`assets/page.tsx` is the one outlier with a more advanced (but still
one-off) pattern: a combined `sortBy:sortDirection` `<select>`, three
filter controls, and the only responsive mobile-card fallback in the
product — but it also doesn't use `PageHeader` (Chapter 1 applied
`PageHeader` to a representative sample only, and Assets wasn't in
it). Three settings tables (`asset-categories` — a recursive tree, not
paginated; `asset-statuses`; `asset-fields`) are smaller, unpaginated
variants of the same hand-written-table pattern. See `UI_AUDIT.md`
findings #15–21 for the full evidence trail (duplication, missing
sort UI, zero row selection/bulk actions anywhere, inline-button row
actions instead of an overflow menu, missing responsive handling on
every page except Assets, `window.confirm`/`window.alert` as the only
confirmation mechanism, and the misplaced shared pagination keys).

Every list hook (`use-customers.ts`, `use-rentals.ts`, etc.) already
returns the identical `{ items, total, page, pageSize }` shape and
accepts `page`/`pageSize`/`search`/`status`-shaped params — `rentals`'
hook additionally accepts and forwards `sortBy`/`sortDirection` to the
API today with **no UI ever setting them**, confirming the backend
contract for column sorting already exists and needs no change for at
least Rentals; other modules would need to confirm their own list
endpoints accept the same params before this chapter wires
click-to-sort into them (verified per-module during implementation,
not assumed uniformly).

### Step 2 — Compared against the governing docs

- `UI_PATTERNS.md`'s existing Tables/Filters/Search/Pagination
  entries already specify almost everything this chapter builds
  (skeleton rows matching real row height, debounced 300ms search,
  active-filter visibility, Previous/Next pagination hidden at
  `total === 0`) — they were written in Chapter 1 as forward-looking
  specification with no implementation to point to yet. Chapter 3 is
  where they finally get one, real, shared component instead of
  seven copies.
- `UX_PRINCIPLES.md` rule 10 ("table behavior is identical
  everywhere — a user who's learned one table has learned all of
  them") is the direct mandate for building exactly one `DataTable`,
  not seven improved-but-still-separate tables. Rule 11 (filtering
  additive/reversible), rule 12 (sorting never silently changes
  selection), rule 13 (search always debounced), and rule 14
  (pagination hidden at zero results) are already-adopted rules this
  chapter is the first to actually exercise end-to-end.
- `UI_RESEARCH.md`'s new Chapter 3 addendum (findings #11–16) directly
  shapes the bulk-actions-bar-replaces-toolbar behavior, the
  overflow-menu row-actions pattern (reusing Chapter 1's
  `DropdownMenu`), the active-filter-badges pattern, and the
  three-state column-sort toggle.
- `ARCHITECTURE_LOCK.md` §3 and §4 forbid new backend surface area and
  role-name checks respectively — directly shapes the bulk-actions
  decision below (client-side orchestration over existing
  single-record endpoints, never a new bulk endpoint) and confirms row
  actions must stay permission-gated via the existing
  `usePermission()` hook, never a new authorization mechanism.

### Step 3 — Design Rationale

1. **One `DataTable` component, generic over row type, driven by a
   column-definition array — not seven improved copies.** Every
   list page currently hand-writes `<th>`/`<td>` JSX directly; the new
   `DataTable<T>` takes `columns: DataTableColumn<T>[]` (id, header,
   cell renderer, optional `sortable`/`sortKey`, optional
   `hideByDefault` for column visibility, optional mobile-card
   `primary`/`secondary` role) plus `data`, `getRowId`, and per-feature
   optional props (`onSortChange`, `selection`, `bulkActions`). A page
   that doesn't need sorting/selection/bulk actions simply omits those
   props — the component degrades cleanly rather than requiring every
   consumer to opt into every feature.
2. **List state consolidates into one `useDataTableState()` hook**,
   replacing the ~6 duplicated `useState` calls (page/search/status/
   sort) every page currently repeats. It does not change what any
   page requests from the API — the same `page`/`pageSize`/`search`/
   `status`/`sortBy`/`sortDirection` shape every hook already accepts.
3. **Column-header sort is added only where the backend already
   accepts `sortBy`/`sortDirection`** — confirmed per-module against
   the actual list endpoint before wiring the UI, never assumed
   uniform. Where a module's list endpoint doesn't accept sort params
   today, its `DataTable` columns simply omit `sortable`, and this is
   documented as a gap for a future task to close at the API layer —
   Chapter 3 does not add new sort support to the backend to make
   every page's UI checkbox true, since that would violate
   `ARCHITECTURE_LOCK.md`'s "no endpoint changes."
4. **Bulk actions are client-side orchestration over each entity's
   existing single-record endpoint, never a new bulk endpoint.** No
   bulk-delete/bulk-status-change endpoint exists anywhere in the API
   today (`UI_AUDIT.md` finding #17) — building one would violate this
   chapter's own "no backend changes" boundary. `BulkActionsBar` is
   built as a fully generic, reusable component (selection count,
   permission-gated action buttons, a real `Dialog`-based confirmation
   naming the exact count and action, per-item progress feedback), but
   is only **wired to a real action** where an equivalent single-record
   action already exists to loop over — concretely, Customers' existing
   `useDeleteCustomer` mutation, called once per selected row with
   progress tracked and surfaced. Bulk "archive"/"export"/"status
   change" are not fabricated for entities that have no matching
   single-record concept to safely batch (Rentals/Quotes have
   multi-step lifecycle transitions via dedicated endpoints like
   `/reserve/`/`/start`, not a generic status-set endpoint — batching
   those safely is a real feature request, not a presentation-layer
   change, and is named as a follow-up in "What Chapter 3 does not
   build" below).
5. **Row actions move into one overflow `DropdownMenu`** (reusing the
   Chapter 1 primitive, never a new menu implementation), replacing
   the inline `Button`-per-action column every page uses today — per
   `UI_RESEARCH.md` finding #12. The trigger and menu items are
   permission-gated exactly as today's inline buttons already are (no
   new authorization logic, just a different container for the same
   gated actions).
6. **`window.confirm`/`window.alert` are replaced by the real `Dialog`
   component for every destructive action this chapter touches**
   (`UI_AUDIT.md` finding #20 — a real, already-flagged stopgap, and
   this chapter's bulk-delete needs a confirmation surface regardless,
   so building the shared `ConfirmDialog` once and using it everywhere
   this chapter touches is strictly less work than adding a tenth
   `window.confirm` call site).
7. **A new `Select` and `Checkbox` primitive are added to
   `@rentos/ui`.** Every filter dropdown in the product today is a
   raw native `<select>` with an identical hand-copied Tailwind class
   string (`UI_COMPONENT_INVENTORY.md`) — `Select` wraps the same
   native element with the shared styling defined once. `Checkbox` is
   genuinely new (row-selection didn't exist before this chapter) and
   uses `@radix-ui/react-checkbox` for correct indeterminate-state
   support (native `<input type="checkbox">`'s indeterminate property
   is JS-only and easy to get wrong for accessibility) — the same
   "reuse a vetted Radix primitive for real accessibility behavior"
   pattern Chapter 1 already established for `Dialog`/`DropdownMenu`.
8. **The table header is sticky within a bounded inner scroll region
   (`max-h-[70vh] overflow-auto`), not page-relative.** `UI_RESEARCH.md`
   finding #16 originally called for a page-relative `sticky top-14`
   header (pinned beneath the shell's own `sticky top-0 h-14` header,
   avoiding a nested scrollbar). That was implemented first and failed
   real-browser verification: `position: sticky` on a `<thead>`
   (`display: table-header-group`) is not reliably specified across
   engines, and in testing it caused the header to render _inside_ the
   first data row's vertical span, visually hiding that row entirely
   (confirmed via DOM inspection — the row existed with correct content
   and non-overlapping computed layout, yet the sticky header painted
   over it). Per-`<th>` sticky (the other common approach) reproduced
   the same overlap. Switching to a bounded `overflow-auto` container
   with `sticky top-0` scoped to that container is the standard,
   cross-browser-reliable pattern and eliminates the page-vs-table
   sticky-context ambiguity entirely — a deliberate downgrade from the
   original "no nested scrollbar" goal in favor of correctness, found
   and fixed during this chapter's own manual verification, not shipped
   broken.
9. **New shared i18n namespace: `common.pagination.*`,
   `common.table.*`, `common.filters.*`, `common.bulkActions.*`.**
   Replaces the misused `customer.previous`/`customer.next` keys
   (`UI_AUDIT.md` finding #21) with real shared keys every migrated
   page uses; per-entity copy (search placeholder, status option
   labels, empty-state text) stays in its own module namespace since
   that content is genuinely entity-specific, not shared.

### What Chapter 3 builds

- `packages/ui`: `Select`, `Checkbox`.
- `apps/web/src/components/data-table/`: `data-table.tsx` (the
  generic `DataTable<T>`, with sorting, selection, sticky header,
  column visibility, loading/skeleton/empty/error/permission-denied
  states, and a config-driven mobile-card fallback below `sm`),
  `data-table-pagination.tsx`, `search-input.tsx` (debounced, with a
  clear button and `Escape`-to-clear keyboard behavior per
  `UI_PATTERNS.md`'s existing Search pattern), `filter-bar.tsx`
  (wraps filter controls, renders active-filter badges + one reset
  action), `bulk-actions-bar.tsx`, `row-actions-menu.tsx` (thin
  `DropdownMenu` wrapper for permission-gated row actions),
  `confirm-dialog.tsx` (the real `Dialog`-based replacement for
  `window.confirm`), `use-data-table-state.ts` (consolidated
  page/search/status/sort state).
- Migrated to the new `DataTable`: Customers, Assets (also adopts
  `PageHeader` for the first time), Rentals, Quotes, Documents,
  Document Templates — the six primary staff list pages — plus the
  Customer Portal's Rentals and Documents lists.
- Real bulk-delete wired end-to-end on Customers (the reference
  implementation for the generic `BulkActionsBar`).
- New shared `common.pagination.*`/`common.table.*`/
  `common.filters.*`/`common.bulkActions.*` localization keys across
  all six locales, plus per-module key updates where copy moved to
  the shared namespace.

### What Chapter 3 does not build (documented gaps, not fabricated)

- **The three settings tables** (`asset-categories`,
  `asset-statuses`, `asset-fields`) are not migrated. `asset-categories`
  is a recursive tree, not a flat paginated list — forcing it into a
  row-per-record `DataTable` would misrepresent its actual data shape;
  it needs its own tree-view pattern, out of this chapter's scope.
  `asset-statuses`/`asset-fields` are small, unpaginated
  configuration tables (typically single-digit row counts) where a
  full `DataTable` (pagination, sorting, bulk actions) is
  disproportionate to the actual content — they're named here as a
  deliberate scope boundary, not an oversight.
- **Bulk archive, bulk export, and bulk status-change** are not built
  for any entity — no matching single-record concept exists to safely
  batch for Rentals/Quotes/Assets/Documents (see design decision 4
  above). The `BulkActionsBar` component is generic and ready for a
  future task to wire up once a real per-entity batchable action
  exists.
- **Column-header sort** is added only to modules whose list endpoint
  already accepts `sortBy`/`sortDirection` — confirmed per module
  during implementation; any module found not to support it keeps its
  existing (non-sortable) columns rather than gaining a fake sort
  control, or a backend change this chapter's scope forbids.
- **The portal notifications list** (`<ul>`, not a table, no
  pagination) and **the portal dashboard's embedded "recent rentals"
  mini-table** (no pagination or filters by design — it's a
  dashboard summary, not a list page) are not migrated; neither is a
  genuine paginated data view.
- **True 2D keyboard grid navigation** (arrow keys moving focus
  between individual cells, the full ARIA `grid` pattern) is not
  built — `DataTable` provides correct native table semantics
  (`<table>`/`<thead>`/`<tbody>`/`<th scope="col">`, `aria-sort` on
  sortable headers) plus full keyboard reachability of every
  interactive element in natural tab order (checkboxes, sortable
  headers, row links, the overflow menu), matching how Linear/GitHub's
  own tables behave — genuinely comprehensive keyboard support without
  building a bespoke spreadsheet-style grid interaction model no
  reference product in `UI_RESEARCH.md` actually uses for a standard
  list either.

### Bugs found and fixed during Chapter 3 verification

Two real, pre-existing defects surfaced only because this chapter's
manual Docker/browser verification actually exercised full page
reloads and multi-row data — both are fixed, in scope of "make the
thing I'm verifying actually work," not a Chapter 3 feature:

- **`DataTable` sticky-header overlap** — see design decision 8 above.
  Fixed by switching to a bounded scroll container.
- **`GET /portal/auth/me` never returned `tenant`, only `{ customer }`**,
  while `login`/`activate-invitation` correctly return
  `{ customer, tenant }` and the frontend's `PortalSession` type and
  `PortalShellLayout` (both written before this chapter, in the
  customer-portal task) unconditionally read `data.tenant.name`. This
  is invisible right after login/activation (the mutation response
  seeds the client cache with a correct `tenant`), but crashes the
  entire portal shell on the very next page load — React Query's
  default `staleTime: 0` triggers an immediate background refetch of
  `usePortalMe()` on mount, which hits the broken endpoint and
  overwrites the cache with the incomplete shape within milliseconds.
  Every real customer would eventually hit this (closing and reopening
  the tab, bookmarking a portal URL). Fixed with a one-line-shaped
  change: `PortalAuthController.me()` now calls a new
  `PortalAuthService.getSession()` that looks up the tenant by
  `customer.tenantId` and returns the same `{ customer, tenant }` shape
  `login`/`activateInvitation` already use — no change to auth
  strategy, cookies, tokens, or session lifetime. Covered by a new
  assertion in `customer-portal-auth.e2e-spec.ts` asserting `tenant` is
  present on `GET /portal/auth/me`; full 465-test API suite still
  green.

## Chapter 4 — Dashboard Experience

**A note on chapter numbering:** the "Later chapters" list below
(written when Chapter 3 closed) had originally named Dashboard as
"Chapter 5" and "Forms & Wizards" as "Chapter 4." The user's own
instruction opening this chapter explicitly frames it as "Chapter 4 —
Dashboard Experience." That instruction is authoritative — this is a
deliberate, user-directed reprioritization, not an inconsistency being
papered over. Dashboard is Chapter 4; Forms & Wizards moves later (see
the renumbered list at the end of this section).

**Scope:** redesign both existing dashboard-adjacent screens — the
staff dashboard (`apps/web/src/app/app/page.tsx`, today a stub) and
the customer portal dashboard
(`apps/web/src/app/portal/(shell)/dashboard/page.tsx`, today real but
ad hoc) — into one consistent, premium Havelio experience built on a
shared, reusable component system. Presentation-layer only, per
`ARCHITECTURE_LOCK.md` §3: no new backend endpoints, no schema
changes, no API contract changes, no fabricated analytics. **Not in
scope:** Forms & Wizards, Settings & Account, or any other later
chapter.

### Step 1 — Current implementation, read directly from source

The staff dashboard (`apps/web/src/app/app/page.tsx`, 26 lines) is a
genuine stub: a `PageHeader` and one "Select tenant" link, with
`useMe()` as its only data fetch. There is nothing to migrate, only to
build (`UI_AUDIT.md` finding #22).

The portal dashboard (`apps/web/src/app/portal/(shell)/dashboard/page.tsx`,
102 lines) is real and functional — `usePortalDashboard()` backs a
5-card stat grid (current/upcoming rentals, unread messages, pending
signatures, pending extensions) and a "Recent rentals" panel with a
raw `<table>` — but hand-writes its `Card`/grid markup inline, uses a
raw `<table>` rather than anything shared, and its loading/error
states are single page-level `<p>` tags with no `Skeleton` usage
anywhere (`UI_AUDIT.md` finding #24). It is the closest existing
design precedent in the product for dashboard layout, but has the
exact duplication and missing-skeleton gaps this chapter's shared
components are meant to eliminate.

No staff-side dashboard backend exists anywhere — `PortalDashboardController`/
`PortalDashboardService` are customer-portal-only, gated by
`CustomerAuthGuard`, and scoped to one customer's own data
(`UI_AUDIT.md` finding #23). Every staff KPI in this chapter is
therefore derived client-side from existing staff list endpoints, each
of which already returns `{ items, total, page, pageSize }`:

| Source hook                                           | Params used                                                                         | What it feeds                                                                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `useCustomers`                                        | `{ pageSize: 1 }`                                                                   | Total customers (no permission family exists for Customers — ungated, matching every other Customers UI element) |
| `useRentals`                                          | `{ pageSize: 1, status: "ACTIVE" }`                                                 | Active rentals — gated `rentals.view`                                                                            |
| `useAssetStatuses` + `useAssets`                      | resolve the real `"AVAILABLE"` system status code, then `{ pageSize: 1, statusId }` | Available assets — gated `assets.read`                                                                           |
| `useQuotes` (×2, summed)                              | `{ pageSize: 1, status: "SENT" }` + `{ pageSize: 1, status: "VIEWED" }`             | Pending quotes (awaiting customer response) — gated `quotes.view`                                                |
| `useStaffExtensionRequests` + `useStaffDamageReports` | unfiltered arrays, counted client-side for `status === "PENDING"` / `"SUBMITTED"`   | Needs attention — gated `customers.portal.manage` (matches the API's own guard on both endpoints)                |
| `useRentals`                                          | `{ pageSize: 5 }` (default `createdAt desc` sort)                                   | Recent Rentals — gated `rentals.view`                                                                            |
| `useDocuments`                                        | `{ pageSize: 5 }` (default `createdAt desc` sort)                                   | Recent Documents — gated `documents.view`                                                                        |

`"AVAILABLE"` is a confirmed real, hardcoded system asset-status
`code` (`apps/api/src/asset-statuses/system-statuses.ts`), resolved by
calling the already-used `useAssetStatuses(tenantId)` hook and finding
the entry whose `code === "AVAILABLE"`, not guessed or hardcoded as an
ID. `useStaffExtensionRequests`/`useStaffDamageReports`
(`apps/web/src/hooks/use-customer-portal.ts`) are real, tested hooks
backing real endpoints that are wired into zero pages today
(`UI_AUDIT.md` finding #25) — this chapter is their first UI consumer,
count-only.

### Step 2 — Compared against the governing docs

- `UI_PATTERNS.md`'s existing "Statistics cards" entry (Purpose/When
  to use/Loading/Empty/Error/Mobile states) was written in the brand
  system task with no implementation to point to — this chapter is
  where it finally gets one. Its rules are followed exactly: a genuine
  zero renders as `"0"`, never blank; an error renders `"—"` with a
  Danger-toned tooltip rather than breaking the page; loading shows a
  skeleton block at the number's approximate width.
- `UI_PATTERNS.md`'s "Charts" entry is already explicitly marked "Not
  yet implemented anywhere in the product... TASK-0016" — confirmed
  still true (`UI_AUDIT.md` finding #28: no charting library, no
  chart-shaped data). This chapter does not change that.
- `BRAND_GUIDELINES.md`'s "Metric cards" rule (number in `Text`
  Semibold, label in `Muted` beneath) is the direct visual spec for
  the new `DashboardMetric` component.
- `UI_RESEARCH.md`'s new Chapter 4 addendum (findings #17-21) directly
  shapes: a fixed, small set of stat cards rather than a configurable
  widget surface; "Recent X" widgets as read-only previews of existing
  list pages, not new features; per-widget (not page-level)
  loading/empty/error states; and Quick Actions as a small, fixed,
  permission-gated set of links to already-existing create routes.
- `UX_PRINCIPLES.md` rule 24 ("a record's status renders consistently
  everywhere, including a dashboard card") governs the Recent Rentals
  status display — it reuses the exact same status-label translation
  keys the Rentals list/detail pages already use, not a new label set.
- `ARCHITECTURE_LOCK.md` §3 forbids new backend endpoints — the direct
  reason the "documents awaiting signature" KPI and a unified
  cross-entity "recent activity" feed are documented as gaps
  (`UI_AUDIT.md` findings #26-27) rather than built.

### Step 3 — Design Rationale

1. **One shared `apps/web/src/components/dashboard/` system, used by
   both the staff and portal dashboards — not two separate
   implementations.** The portal dashboard already has real,
   functional content; rather than leaving it as a second,
   inconsistent pattern while the staff dashboard gets the new shared
   components, this chapter refactors the portal dashboard onto the
   same primitives. This is what "no duplicated dashboard cards, no
   duplicated metric components, no duplicated section headers" (this
   chapter's own instruction) requires system-wide, not just within
   the staff app.
2. **`DashboardMetric` is the stat-card primitive**, implementing
   `UI_PATTERNS.md`'s Statistics cards spec exactly: value, label,
   optional `href` (stat cards that link to their source list page,
   e.g. "Active rentals" → `/app/rentals?status=ACTIVE`), and
   loading/empty/error sub-states per card, not per page. It replaces
   both the staff dashboard's future stat cards and the portal
   dashboard's five hand-written `Card`/`CardContent` blocks.
3. **`DashboardCard` is a thin, titled container** (composing the
   existing `Card`/`CardHeader`/`CardTitle` primitives from
   `@rentos/ui` with an optional "View all" link in the header),
   replacing the portal dashboard's inline
   `Card`+`CardHeader`+`CardTitle`+link boilerplate and giving Recent
   Rentals, Recent Documents, and Quick Actions one consistent header
   treatment.
4. **`RecentActivity` is a generic "recent items" list widget, not a
   fabricated unified feed.** Since no audit-log read endpoint exists
   (`UI_AUDIT.md` finding #26), a true cross-entity activity stream is
   not buildable this chapter. `RecentActivity` is instead a reusable
   component generic over a caller-provided row renderer and "view
   all" href — instantiated twice (Recent Rentals, Recent Documents)
   against two real, already-existing data sources. This satisfies the
   "widgets must be reusable" requirement honestly: one component
   shape, two real real instantiations, not one fake merged feed.
5. **`DashboardGrid` and `DashboardSection` are layout-only wrappers**
   — `DashboardGrid` is the responsive stat-card grid
   (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`, the exact breakpoints
   the portal dashboard already uses and validated), and
   `DashboardSection` provides one consistent heading+spacing pattern
   for grouping "Overview," "Quick actions," and "Recent activity" —
   satisfying "no duplicated section headers."
6. **`DashboardSkeleton` is one configurable skeleton, reused by both
   `DashboardMetric` (a number-width block) and `RecentActivity` (N
   placeholder rows)**, rather than a bespoke skeleton per widget —
   this is what replaces the portal dashboard's current page-level
   `<p>{t("common.loading")}</p>` with the real, already-specified
   per-card skeleton behavior from `UI_PATTERNS.md`.
7. **`EmptyDashboardState` is one shared empty-state component**, used
   wherever a widget's real data is genuinely empty (zero recent
   rentals, zero recent documents) — replacing the portal dashboard's
   one-off `<p>{t("portal.dashboard.noRentals")}</p>` with a shared,
   consistently-styled component, per "no duplicated empty-state
   implementations."
8. **`QuickActions` links to five existing, already-permission-gated
   create routes — it invents no new workflow.** Reusing the exact
   gates each route's own page already enforces:

   | Action       | Route                | Gate                        |
   | ------------ | -------------------- | --------------------------- |
   | New customer | `/app/customers/new` | none (no permission family) |
   | New asset    | `/app/assets/new`    | `assets.create`             |
   | New rental   | `/app/rentals/new`   | `rentals.create`            |
   | New quote    | `/app/quotes/new`    | `quotes.create`             |
   | New document | `/app/documents/new` | `documents.create`          |

   An action is hidden entirely (not disabled) when the current user
   lacks its permission, matching `UX_PRINCIPLES.md`'s existing
   "enforced by omission" principle already applied to nav items and
   row actions in Chapters 1 and 3.

9. **"Upcoming tasks" is answered by a single, permission-gated "Needs
   attention" `DashboardMetric`, not a new task-list feature.** No
   Task/Todo model exists anywhere in the schema. The closest real
   equivalent — pending customer-submitted extension requests and
   submitted-but-unreviewed damage reports — is a count, not a list,
   surfaced behind `customers.portal.manage` (the same guard the
   underlying endpoints already enforce) since building a full
   list-and-triage UI for two features that already have zero UI
   consumers today (`UI_AUDIT.md` finding #25) would be a
   disproportionate new workflow surface for a presentation-only
   dashboard chapter, not a bug fix to an existing screen.
10. **Charts are not built.** No charting library is installed and no
    chart-shaped time-series data exists (`UI_AUDIT.md` finding #28,
    already flagged in `UI_PATTERNS.md` as TASK-0016). Per this
    chapter's own instruction ("if no chart data exists, do not invent
    new endpoints — document the limitation"), this is recorded as a
    gap, not built.
11. **A new `apps/web/src/hooks/use-dashboard-stats.ts` composes
    existing hooks into one aggregated object the dashboard page
    consumes** — it calls `useCustomers`/`useRentals`/
    `useAssetStatuses`+`useAssets`/`useQuotes` (×2)/
    `useStaffExtensionRequests`/`useStaffDamageReports` in parallel and
    exposes a stable `{ metric: { value, isLoading, isError, href } }`
    shape per card. This is client-side composition over already-real
    endpoints, not a new backend aggregation endpoint — the frontend
    equivalent of the "pageSize:1, read `.total`" technique already
    used per-hook.

### What Chapter 4 builds

- `apps/web/src/components/dashboard/`: `dashboard-grid.tsx`,
  `dashboard-metric.tsx`, `dashboard-card.tsx`, `dashboard-section.tsx`,
  `dashboard-skeleton.tsx`, `empty-dashboard-state.tsx`,
  `quick-actions.tsx`, `recent-activity.tsx`.
- `apps/web/src/hooks/use-dashboard-stats.ts` — aggregates existing
  staff list-endpoint hooks into the KPI set in Step 1's table.
- Staff dashboard (`apps/web/src/app/app/page.tsx`) rebuilt as a real
  dashboard: KPI grid, Quick Actions, Recent Rentals, Recent
  Documents, permission-gated "Needs attention" card — all built on
  the shared components above.
- Portal dashboard
  (`apps/web/src/app/portal/(shell)/dashboard/page.tsx`) refactored
  onto the same shared components (its data source, `usePortalDashboard()`,
  is unchanged — only its presentation layer moves onto
  `DashboardMetric`/`DashboardCard`/`DashboardGrid`/`RecentActivity`/
  `DashboardSkeleton`/`EmptyDashboardState`).
- New `dashboard.*` localization keys across all six locales.
- Component tests for the new shared components; regression tests for
  both dashboard pages.

### What Chapter 4 does not build (documented gaps, not fabricated)

- **A true cross-entity "recent activity" feed** (one merged
  chronological stream of rentals + documents + quotes + customer
  changes) — no audit-log read endpoint exists (`UI_AUDIT.md` finding
  #26). Two separate, real "Recent Rentals"/"Recent Documents" panels
  are built instead.
- **A "documents awaiting signature" KPI** — only a per-document
  signature-requests endpoint exists, no tenant-wide list
  (`UI_AUDIT.md` finding #27).
- **Charts of any kind** — no charting library installed, no
  chart-shaped data exists (`UI_AUDIT.md` finding #28); matches
  `UI_PATTERNS.md`'s pre-existing TASK-0016 note.
- **A configurable/customizable widget dashboard** (drag-and-drop,
  add/remove cards) — every reference product's dashboard is a fixed,
  deliberately chosen set of KPIs, not a generic widget surface
  (`UI_RESEARCH.md` finding #17); building configurability here would
  be a disproportionate new feature for a presentation-layer chapter.
- **A full extension-request/damage-report triage UI** — surfaced only
  as a count (design decision 9); building the list-and-approve
  workflow for those two features is a real, separable follow-up task,
  not something to fold into a dashboard chapter.
- **New backend endpoints, schema changes, or API contract changes of
  any kind** — every widget in this chapter is fed by an
  already-existing endpoint, confirmed per data source in Step 1's
  table.

## Chapter 5 — Productivity Layer

**A note on chapter numbering:** the "Later chapters" list below
(written when Chapter 3 closed, before `docs/PRODUCT_BIBLE.md`
existed) had named "Forms & Wizards" as Chapter 5. The user's own
instruction opening this chapter explicitly frames it as "Chapter 5 —
Productivity Layer," the same kind of deliberate, user-directed
reprioritization Chapter 4 already made for Dashboard. Productivity
Layer is Chapter 5; Forms & Wizards moves later (see the renumbered
list at the end of this section).

**Scope:** one unified, reusable productivity layer — not "a Command
Palette feature" — spanning global search, quick actions, keyboard
shortcuts, recent items, favorites/pinned items, and discoverability
hints, built on the existing `CommandItem`/`QuickActionDefinition`
seams rather than a second, parallel system. Presentation-layer only,
per `ARCHITECTURE_LOCK.md` §3: no new backend endpoints, no schema
changes. Checked against `PRODUCT_BIBLE.md` first, per that
document's own reading order — this is the first chapter whose Step 2
below cites it before the brand/pattern/UX documents.

### Step 1 — Current implementation, read directly from source

The Command Palette (`apps/web/src/components/shell/command-palette.tsx`,
added Chapter 1) is real but honestly incomplete by its own header
comment: every command is `kind: "navigate"`, filtering the same
permission-gated nav list whether the query is empty or not — no
Recent, no Pinned/Favorites, no Quick Actions, no real search results
(`UI_AUDIT.md` finding #29). `Cmd/Ctrl+K` (`apps/app/layout.tsx`) is
the only global keyboard shortcut in the product, and its listener has
no guard against focus being inside a text field — safe today only
because no bare-letter shortcut exists yet to collide with normal
typing (finding #30). `lib/quick-actions.ts` (Chapter 4) is already
the single shared source of the five real create routes, consumed by
both `QuickCreate` and the Dashboard's `QuickActions` widget — a
"Create Category" destination exists and isn't in that list yet; a
"New Invoice" destination doesn't exist anywhere in the product
(finding #31). No Users/team-management page exists to search or link
to (finding #32). No Recent Items, Favorites, or Pinned Items concept
exists anywhere (finding #33) — `use-sidebar-state.ts`/
`use-dark-mode.ts` (Chapter 1) are the proven, reusable
`useSyncExternalStore` + `localStorage` pattern for whatever this
chapter builds, though both existing stores are deliberately
browser-global rather than per-user. No discoverability/hint system
exists anywhere (finding #34, matching `PRODUCT_BIBLE.md` §5's own
gap list). The sidebar's `⌘K` badge is hardcoded to the Mac symbol
regardless of platform (finding #35). `UI_PATTERNS.md` already
references a "Command Palette" pattern entry that doesn't exist
(finding #36).

### Step 2 — Compared against the governing docs

- `PRODUCT_BIBLE.md` §3 (Zero Friction), §4 (One Click Rule), §5
  (Productivity Philosophy), §6 (Power User Experience), §7 (AI
  Readiness), and §9 (Discoverability) are, collectively, this
  chapter's entire brief — every numbered build item in the user's own
  instruction maps onto one of these sections, and §7 in particular is
  the direct source of this chapter's "extend existing typed seams,
  never build a parallel AI-only code path" constraint.
- `PRODUCT_BIBLE.md` §10 (Anti-Patterns) — "no duplicated UI," "no
  duplicated implementations" — is the direct reason Favorites and
  Pinned Items (design decision 7 below) share one underlying store
  instead of two nearly-identical ones, and the reason the Command
  Palette's Quick Actions section reads from the _existing_
  `lib/quick-actions.ts` list rather than a second copy.
- `UX_PRINCIPLES.md` rule 6 (max 3 clicks/taps to any common action)
  and rule 8 ("keyboard shortcuts are consistent across the whole
  product, never redefined per page... this rule governs TASK-0010's
  Command Palette/shortcut work so it ships consistent from the first
  shortcut, not retrofitted later") are the direct, already-written
  mandate for this chapter's keyboard-shortcut registry.
- `UI_RESEARCH.md`'s new Chapter 5 addendum (findings #22-26) directly
  shapes: the palette's composed-sections data model (finding #22),
  the pluggable search-provider registry (finding #23), the
  declarative shortcut registry with mandatory input-focus guarding
  (finding #24), the "same seam a human uses" AI-readiness shape
  (finding #25), and the dismiss-once/anchor-to-the-real-control hint
  pattern (finding #26).
- `ARCHITECTURE_LOCK.md` §3 forbids new backend endpoints — the direct
  reason Recent Items/Pinned Items/dismissed-hints are client-side
  (`localStorage`) rather than a new per-tenant preferences table, and
  the reason search providers reuse each entity's existing `search`
  list-endpoint parameter rather than a new dedicated search endpoint.

### Step 3 — Design Rationale

1. **One `CommandItem`-driven palette, not a palette plus three
   separate "recent/pinned/search" widgets.** The palette already
   composes a flat list from one typed shape (Chapter 1); this chapter
   adds new `CommandItem` sources (recent, pinned, search results,
   quick actions) that all render through the exact same list/keyboard-
   navigation code already in `command-palette.tsx`, rather than four
   different rendering paths bolted together. This is the direct
   answer to build item 9 ("never open empty" — an empty query now
   composes Recent + Pinned + Quick Actions + Navigation sections in
   one pass).
2. **`SearchProvider` is a typed, pluggable registry
   (`lib/search-providers.ts`), never a hardcoded per-entity branch
   inside the palette.** Each provider declares `{ id, labelKey, icon,
permission, search(query, tenantId) }`; the palette iterates the
   registry and merges results, permission-filtering exactly like
   `nav-registry.ts`/`lib/quick-actions.ts` already do. **Five real
   providers are built** — Customers, Assets, Rentals, Quotes,
   Documents — each calling the exact same `search`-accepting list
   endpoint its own list page already uses (`apiClient.get` with the
   identical URL/params shape as `useCustomers`/`useAssets`/etc.), so
   this is genuine, working cross-entity search with **zero new
   backend endpoints** — not the inert "architecture only" stub the
   user's own instruction explicitly allows for this item, upgraded to
   real because the underlying capability already existed and needed
   no new API surface to reach. **Users and Invoices are not built as
   providers** — no team-management page and no Invoices module exist
   anywhere in the product (findings #31-32) — documented as gaps
   below, never a provider that searches nothing or 404s.
3. **The keyboard shortcut registry (`lib/keyboard-shortcuts.ts`) is
   declarative data, checked once by one global listener** — adding a
   shortcut is adding an array entry, never touching the listener
   itself, per this chapter's own "must allow adding shortcuts without
   touching existing code" requirement. The listener replaces
   `apps/app/layout.tsx`'s ad hoc `Cmd/Ctrl+K`-only handler and adds
   the input-focus guard `UI_AUDIT.md` finding #30 identifies as
   missing — every bare-letter shortcut is suppressed while focus is
   inside `input`/`textarea`/`[contenteditable]` or any element with
   `role="textbox"`. **Chords (`G` then a second key)** are supported
   via a short-lived "awaiting second key" state with a timeout
   (matching GitHub/Linear's own "go to" pattern, `UI_RESEARCH.md`
   finding #24) — `G C`/`G R`/`G A`/`G D`/`G Q` navigate to the five
   primary entities, mirroring `nav-registry.ts`'s existing five
   workspace items exactly (no sixth destination invented). `N` opens
   Quick Create (the existing dropdown, not a new surface); `/` opens
   the Command Palette in search mode (same target as `Cmd/Ctrl+K` —
   two entry points to one surface, not two surfaces); `Shift+?` opens
   a new, real Shortcuts Help dialog listing every registered shortcut
   read live from the same registry (so it can never drift out of
   sync with what's actually bound); `Esc` closes whatever's open
   (already Radix `Dialog`'s built-in behavior, not new code).
4. **Recent Items is one generic service
   (`hooks/use-recent-items.ts`), not per-entity tracking code.** A
   single `useTrackRecentItem({ entityType, entityId, label, href })`
   hook, called once on mount by each of the five entity detail pages
   (Customer/Asset/Rental/Quote/Document), writes to one shared,
   capped (configurable, default 8), most-recent-first, de-duplicated
   `localStorage` list. Namespaced per **user and tenant**
   (`rentos_recent_items:<userId>:<tenantId>`) — a deliberate,
   documented difference from `use-sidebar-state.ts`/`use-dark-mode.ts`'s
   browser-global keys (`UI_AUDIT.md` finding #33), since recent
   activity is workflow state tied to a specific person in a specific
   tenant, not a display preference reasonably shared by whoever uses
   the browser.
5. **Recent Items also tracks page-level navigation** (matching
   `command-types.ts`'s existing `"recent-page"` kind) via a small
   route-change listener in `AppLayout` resolving a label from
   `nav-registry.ts` — reusing the registry that already maps every
   top-level route to a translated label, rather than a second,
   competing route→label map.
6. **One generic `usePinnedItems()` store serves both "Favorites" and
   "Pinned Items"** from the user's own build list (items 6 and 7) —
   read together, their descriptions are structurally identical
   (`{ entityType, entityId, label, href, pinnedAt }`, "do not hardcode
   entity types," "support customers/assets/rentals/documents/future
   entities"). Building two parallel, nearly-identical localStorage
   stores under two names would directly violate this chapter's own
   "no duplicated implementations" rule and `PRODUCT_BIBLE.md` §10.
   The single store is exposed as `usePinnedItems()`
   (`hooks/use-pinned-items.ts`), and the Command Palette surfaces it
   under one "Pinned" section (starred) — the product-facing "Favorite"
   and "Pin" language both resolve to the identical underlying action
   (`togglePinned(ref)`), documented here as a deliberate consolidation
   decision, not a dropped requirement. A pin toggle button is added to
   the five entity detail pages (Customer/Asset/Rental/Quote/Document),
   generic over `entityType`, satisfying "do not hardcode entity types"
   and "support... future entities" (any future detail page adds one
   `<PinButton entityType="..." .../>` call, no new store code).
7. **Discoverability hints are one reusable, generic primitive
   (`useDismissibleHint(hintId)` + `<DismissibleHint>`), instantiated
   for exactly one real hint** — a small, non-modal callout near the
   header's search trigger ("Press `Ctrl+K` (or `⌘K`) to search or
   jump anywhere"), dismissible, remembered per user
   (`localStorage`, `rentos_dismissed_hints:<userId>`), never shown
   again once dismissed, never blocking interaction with anything
   underneath it — the exact shape `PRODUCT_BIBLE.md` §5's "teach
   through usage, never a blocking tutorial" and `UI_RESEARCH.md`
   finding #26 require. This chapter does not build a general
   onboarding/coaching engine, adaptive difficulty, or a checklist
   flow — `PRODUCT_BIBLE.md` §5 already names those as real, separate,
   larger gaps for a future chapter, and building a full coaching
   system to justify one hint would be exactly the kind of
   disproportionate scope `ARCHITECTURE_LOCK.md`'s "no broad rewrite...
   without a specific, stated necessity" principle warns against,
   applied here to net-new feature scope instead of a rewrite.
8. **The `⌘K`/`Ctrl+K` badge is now platform-aware.** A small
   `isMacPlatform()` check (`navigator.userAgent`, no new dependency)
   picks the symbol shown in the sidebar's search trigger, the header's
   shortcut badge, and the new Shortcuts Help dialog — one shared
   helper, not three separate platform checks (`UI_AUDIT.md` finding
   #35).
9. **AI readiness is documentation and typing discipline, not a new
   code path.** `SearchProvider`, `CommandItem`, and
   `QuickActionDefinition` are written so a future AI agent calls the
   identical functions/objects a human interaction already calls (no
   provider reads `document.activeElement`, no handler assumes a mouse
   event exists) — verified per-file during implementation, not just
   asserted. A short, explicit comment block in
   `lib/search-providers.ts` and `command-types.ts` documents the
   intended future extension points (`AiSearchProvider`, an
   AI-invocable `executeCommand(id)`) without implementing either —
   per this chapter's explicit "do NOT build AI" instruction.
10. **New `UI_PATTERNS.md` entries: "Command Palette" and "Keyboard
    shortcuts."** `UI_AUDIT.md` finding #36 found the Search pattern
    already references a Command Palette entry that was never written;
    this chapter is substantially building/extending both patterns and
    documents them with the same Purpose/When to use/Visual/Keyboard/
    Loading/Empty/Error/Mobile rigor as every other entry in that file.

### What Chapter 5 builds

- `apps/web/src/lib/`: `keyboard-shortcuts.ts` (typed registry +
  chord support), `search-providers.ts` (pluggable registry, five real
  providers: Customers/Assets/Rentals/Quotes/Documents),
  `recent-items.ts` + `hooks/use-recent-items.ts`
  (`useTrackRecentItem`, `useRecentItems`), `pinned-items.ts` +
  `hooks/use-pinned-items.ts` (`usePinnedItems`, `togglePinned`),
  `platform.ts` (`isMacPlatform`), extended `command-types.ts`
  (`"action"` kind populated, AI extension-point comments).
- `lib/quick-actions.ts`: adds "Create Category"
  (`asset_categories.manage`); documents the Invoice gap inline rather
  than adding a dead link.
- `apps/web/src/components/shell/`: `command-palette.tsx` rewritten
  around composed sections (Recent, Pinned, Quick Actions, Search,
  Navigation); new `shortcuts-help-dialog.tsx`; new
  `command-palette-hint.tsx` (the one real discoverability hint,
  built on a new generic `dismissible-hint.tsx` primitive); a
  `pin-button.tsx` added to the five entity detail pages.
- `apps/app/layout.tsx`: the ad hoc `Cmd/Ctrl+K` listener replaced by
  the shortcut registry's single global listener (input-focus-guarded)
  plus a route-change recent-page tracker.
- New `productivity.*` localization keys across all six locales.
- `UI_PATTERNS.md`: new "Command Palette" and "Keyboard shortcuts"
  entries.
- Component/hook tests for every new piece; no skipped tests.

### What Chapter 5 does not build (documented gaps, not fabricated)

- **A "Users" search provider or Quick Action** — no team-management
  page exists anywhere in the product yet (`UI_AUDIT.md` finding #32);
  building one is a real, separate feature (the Chapter 2 audit
  already named "staff invitation into an existing tenant" as a gap),
  not something to retrofit into a productivity-layer chapter.
- **A "New Invoice" Quick Action** — no Invoices module exists;
  `VISION.md` already lists rental customer invoicing as "Planned,
  later phase." No dead link is added.
- **Any real AI provider or AI-invoked command execution** — per this
  chapter's explicit instruction, only the typed extension points and
  a documentation comment are added (design decision 9); no AI code
  runs anywhere in this chapter's diff.
- **A general onboarding/coaching engine, adaptive difficulty, or
  first-run checklist** — `PRODUCT_BIBLE.md` §5 already names these as
  real, larger gaps; this chapter builds the one reusable hint
  primitive and one real, honest instance of it, not a coaching system
  built to justify itself.
- **Server-synced Recent Items/Pinned Items** (available across
  devices, surviving a cleared browser) — today's implementation is
  `localStorage`-only, per `ARCHITECTURE_LOCK.md` §3's "no new backend
  endpoints" boundary for this chapter; a future chapter can add a
  real per-tenant preferences table and swap the storage layer behind
  the same `usePinnedItems()`/`useRecentItems()` hook signatures
  without touching any consumer.

## Later chapters (named, not detailed — scoped when reached)

- **Chapter 6 — Forms & Wizards:** reconcile `RentalWizard`/
  `QuoteWizard` against `UI_PATTERNS.md`'s Wizard/Stepper/Forms specs.
- **Chapter 7 — Settings & Account:** profile/account pages, the
  language-switcher's live wiring, notification preferences once a
  backend exists.

Each future chapter follows the same process this one does: read the
implementation, audit against `PRODUCT_BIBLE.md` and the other
governing docs, write a Design Rationale, implement, verify, document,
commit.
