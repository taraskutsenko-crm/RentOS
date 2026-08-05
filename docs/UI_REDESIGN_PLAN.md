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

## Later chapters (named, not detailed — scoped when reached)

- **Chapter 4 — Forms & Wizards:** reconcile `RentalWizard`/
  `QuoteWizard` against `UI_PATTERNS.md`'s Wizard/Stepper/Forms specs.
- **Chapter 5 — Dashboard:** a real staff dashboard (stat cards,
  recent activity), reusing the Customer Portal dashboard's proven
  shape.
- **Chapter 6 — Settings & Account:** profile/account pages, the
  language-switcher's live wiring, notification preferences once a
  backend exists.

Each future chapter follows the same process this one does: read the
implementation, audit against the four governing docs, write a Design
Rationale, implement, verify, document, commit.
