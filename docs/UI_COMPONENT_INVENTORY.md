# UI Component Inventory

A catalog of every existing UI building block. Originally written as
of commit `594a6e0`, before TASK-0010 Part 2's shell redesign; the
primitives table below is kept current through each chapter (Chapter
1 added `Skeleton`/`DropdownMenu`/`Dialog`; Chapter 2 added `Alert`'s
`success`/`warning`/`info` variants; Chapter 3 added `Checkbox`,
`Select`, `DialogHeader`/`DialogFooter`, and the entire
`apps/web/src/components/data-table/` system; Chapter 4 adds the
`apps/web/src/components/dashboard/` system) rather than left as a
stale snapshot. Read directly from source — see
[`UI_AUDIT.md`](UI_AUDIT.md) for the findings this inventory feeds
into and [`UI_REDESIGN_PLAN.md`](UI_REDESIGN_PLAN.md) for what gets
built on top of it.

## Shared primitives (`packages/ui/src/components/`) — current as of Chapter 3

| Component                                                                                           | File                  | Notes                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Button`                                                                                            | `button.tsx`          | `cva`-based variants (`default`/`destructive`/`outline`/`secondary`/`ghost`/`link`) x sizes (`default`/`sm`/`lg`/`icon`).                                                                                                                                                                                                      |
| `Input`                                                                                             | `input.tsx`           | Native `<input>` wrapper, `aria-invalid` styling, disabled state.                                                                                                                                                                                                                                                              |
| `Label`                                                                                             | `label.tsx`           | Native `<label>` wrapper.                                                                                                                                                                                                                                                                                                      |
| `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`                        | `card.tsx`            | Plain composable div wrappers.                                                                                                                                                                                                                                                                                                 |
| `Alert`/`AlertDescription`                                                                          | `alert.tsx`           | `default`/`destructive`/`success`/`warning`/`info` variants (Chapter 2 added the last three).                                                                                                                                                                                                                                  |
| `Skeleton`                                                                                          | `skeleton.tsx`        | Added Chapter 1. **Now used by `DataTable`'s loading state** (Chapter 3) — real per-column-width skeleton rows, replacing every list page's hand-rolled `bg-muted` div.                                                                                                                                                        |
| `DropdownMenu` (+ `Trigger`/`Content`/`Item`/`Label`/`Separator`/`Group`)                           | `dropdown-menu.tsx`   | Added Chapter 1. **Now used for row-level table actions** (Chapter 3's `RowActionsMenu` + `DataTable`'s column-visibility menu) — see `UI_AUDIT.md` finding #18.                                                                                                                                                               |
| `Dialog` (+ `Trigger`/`Portal`/`Close`/`Overlay`/`Content`/`Header`/`Footer`/`Title`/`Description`) | `dialog.tsx`          | Added Chapter 1; `Header`/`Footer` + default `p-6` padding added Chapter 3 for `ConfirmDialog`, its first "standard content dialog" consumer (`command-palette.tsx` stays a bespoke `p-0` layout). **Now used for destructive-action confirmation** — see `UI_AUDIT.md` finding #20 and the "Bugs found and fixed" note below. |
| `Checkbox`                                                                                          | `checkbox.tsx`        | Added Chapter 3. Radix-based, indeterminate-state support, for row selection.                                                                                                                                                                                                                                                  |
| `Select`                                                                                            | `select.tsx`          | Added Chapter 3. Styled native `<select>` wrapper — kept native (not a Radix combobox) since no filter needs custom option rendering.                                                                                                                                                                                          |
| `DatePicker`                                                                                        | `date-picker.tsx`     | Added Pre-Chapter 10 (Part B). Single-date mode, two-month desktop / bottom-sheet mobile.                                                                                                                                                                                                                                      |
| `TimePicker`                                                                                        | `time-picker.tsx`     | Added Pre-Chapter 10 (Part B). 15-minute-interval `<select>`/combobox plus free-text entry for a value not on the grid.                                                                                                                                                                                                        |
| `DateTimeField`                                                                                     | `date-time-field.tsx` | Added Pre-Chapter 10 (Part B). Composes `DatePicker` + `TimePicker`; replaced every `<input type="datetime-local">` in the Rental/Quote wizards.                                                                                                                                                                               |

**Still not built in `@rentos/ui`**, despite being specified in
`UI_PATTERNS.md`: `Tabs`, `Toast`, `Tooltip`. `Table` was deliberately
built at the `apps/web` app layer instead (`components/data-table/`,
see below) rather than as a generic `packages/ui` primitive, since
every real consumer needed tenant/permission-aware business logic (row
hrefs, permission-gated actions) that doesn't belong in a
presentation-only shared package.

## The `DataTable` system (`apps/web/src/components/data-table/`) — added Chapter 3

The one shared table for every data-heavy staff and portal screen —
see `UI_REDESIGN_PLAN.md` Chapter 3 for the full design rationale.

| File                        | Purpose                                                                                                                                                                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-table.tsx`            | The generic `DataTable<T>`: sorting (3-state column-header cycle), row selection, sticky header inside a bounded scroll region, column visibility, loading/skeleton/empty/error/permission-denied states, `rowHref`/`rowActions`, responsive mobile-card fallback below `sm`. |
| `data-table-pagination.tsx` | Shared Previous/Next + range footer, using `common.pagination.*` i18n keys.                                                                                                                                                                                                   |
| `search-input.tsx`          | Debounced (via `useDataTableState`) search box with a clear button.                                                                                                                                                                                                           |
| `filter-bar.tsx`            | Layout wrapper for a page's search + filter controls, plus active-filter badges and a reset-all action.                                                                                                                                                                       |
| `bulk-actions-bar.tsx`      | Contextual toolbar shown once at least one row is selected; every action is client-side orchestration over an existing single-record endpoint — no bulk endpoint exists on the backend for any entity.                                                                        |
| `row-actions-menu.tsx`      | Declarative `RowAction[]` list rendered as consistent `DropdownMenuItem`s (regular then destructive, separated), for `DataTable`'s row-actions overflow menu.                                                                                                                 |
| `confirm-dialog.tsx`        | `Dialog`-based replacement for `window.confirm`, with a real loading state during the async action.                                                                                                                                                                           |
| `use-data-table-state.ts`   | Consolidated page/search(debounced)/sort/selection state hook, shared by every migrated page.                                                                                                                                                                                 |
| `types.ts`                  | `DataTableColumn<T>`, `SortState` shared types.                                                                                                                                                                                                                               |

Migrated to this system: Customers, Assets (also its first-ever
`PageHeader` adoption), Rentals, Quotes, Documents, Document
Templates, and the Customer Portal's Rentals and Documents lists — 8
pages total. Real bulk-delete is wired end-to-end on Customers as the
reference implementation. Not migrated (documented gaps, not an
oversight): the three settings tables (`asset-categories` is a tree,
not a flat list; `asset-statuses`/`asset-fields` are small unpaginated
config tables where a full `DataTable` is disproportionate), and the
portal notifications list / dashboard mini-table (neither is a genuine
paginated data view) — see `UI_REDESIGN_PLAN.md` Chapter 3, "What
Chapter 3 does not build."

### Bugs found and fixed during Chapter 3

- **`DataTable`'s sticky header** was first built page-relative
  (`position: sticky` on the `<thead>`), which browsers do not
  reliably support for `display: table-header-group` — it caused the
  header to paint over the first data row, hiding it. Fixed by
  switching to a bounded `overflow-auto` scroll container with
  `sticky top-0` scoped to that container. See `UI_REDESIGN_PLAN.md`
  Chapter 3, design decision 8, for the full investigation.
- **`GET /portal/auth/me`** never returned `tenant`, only
  `{ customer }`, silently breaking the entire customer portal on any
  page reload (a pre-existing bug from the customer-portal task,
  unrelated to Chapter 3's own diff, but blocking this chapter's own
  manual verification of the two migrated portal pages). Fixed in
  `PortalAuthController`/`PortalAuthService`; see
  `UI_REDESIGN_PLAN.md` Chapter 3 for the full root-cause writeup.

## List-page duplication — resolved in Chapter 3

Seven list pages (`rentals`, `quotes`, `documents`,
`documents/templates`, `customers`, `portal/(shell)/rentals`,
`portal/(shell)/documents`) used to independently hand-write the same
pattern: a local `useState(1)` page counter, a local search/status
`useState` pair, a native `<table>` inside `Card`/`CardContent`, three
fake skeleton `<div>`s, a `<p>` empty state, and a hand-rolled
Previous/Next footer reusing the `customer.previous`/`customer.next`
i18n keys regardless of the page's actual entity (`UI_AUDIT.md`
finding #21). All eight list pages (the seven above plus `assets`,
which already had the most advanced pre-Chapter-3 pattern: a combined
sort `<select>`, 3 filters, and the only responsive mobile-card
fallback) now share the `DataTable` system described above. Three
settings tables remain intentionally un-migrated — see "Not migrated"
above.

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

## The dashboard component system (`apps/web/src/components/dashboard/`) — added Chapter 4

The one shared widget system for both dashboard pages — see
`UI_REDESIGN_PLAN.md` Chapter 4 for the full design rationale.

| File                        | Purpose                                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dashboard-grid.tsx`        | `DashboardGrid` — the responsive stat-card grid (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`), the same breakpoints the portal dashboard already used.                                                                   |
| `dashboard-metric.tsx`      | `DashboardMetric` — the stat-card primitive: value/label, optional `href`, per-card loading (skeleton)/error (`—` + tooltip)/genuine-zero (`0`) states, per `UI_PATTERNS.md`'s Statistics cards spec.                    |
| `dashboard-card.tsx`        | `DashboardCard` — thin titled container (`Card`+`CardHeader`+`CardTitle`) with an optional "View all" link, replacing hand-written header boilerplate.                                                                   |
| `dashboard-section.tsx`     | `DashboardSection` — one consistent heading + spacing wrapper for page sections ("Overview," "Quick actions," "Recent activity").                                                                                        |
| `dashboard-skeleton.tsx`    | `DashboardSkeleton` — one configurable skeleton (`variant: "metric" \| "rows"`), reused by `DashboardMetric` and `RecentActivity`.                                                                                       |
| `empty-dashboard-state.tsx` | `EmptyDashboardState` — shared empty-state (icon + message) for widgets with genuinely no data.                                                                                                                          |
| `quick-actions.tsx`         | `QuickActions` — renders a permission-filtered `QuickAction[]` as a button row; hides (never disables) actions the user lacks permission for.                                                                            |
| `recent-activity.tsx`       | `RecentActivity<T>` — generic "recent items" list widget (loading/error/empty/row states) driven by a caller-provided row renderer; instantiated for Recent Rentals and Recent Documents, not a fabricated unified feed. |
| `index.ts`                  | Barrel export, matching the `data-table/index.ts` convention.                                                                                                                                                            |

`apps/web/src/hooks/use-dashboard-stats.ts` composes existing staff
list-endpoint hooks (`useCustomers`, `useRentals`, `useAssetStatuses`+
`useAssets`, `useQuotes` ×2, `useStaffExtensionRequests`+
`useStaffDamageReports`) into one aggregated KPI object — no new
backend endpoint, the frontend equivalent of the "pageSize:1, read
`.total`" technique.

`apps/web/src/lib/quick-actions.ts` is the single source of truth for
the five existing, permission-gated create routes — shared by the
header's `QuickCreate` dropdown (Chapter 1) and the dashboard's
`QuickActions` widget, fixing a real drift bug found during this
chapter's research: `QuickCreate` had never been updated with the
Documents create action added in Chapter 3.

Both dashboard pages consume this system: the staff dashboard
(`apps/web/src/app/app/page.tsx`, previously a stub) and the portal
dashboard (`apps/web/src/app/portal/(shell)/dashboard/page.tsx`,
refactored off its previous ad hoc `Card`/table markup — its data
source, `usePortalDashboard()`, is unchanged).

### What Chapter 4 does not build (documented gaps, not fabricated)

- **A true cross-entity "recent activity" feed** — no audit-log read
  endpoint exists. Two separate, real "Recent Rentals"/"Recent
  Documents" panels are built instead (`RecentActivity` reused twice).
- **A "documents awaiting signature" KPI** — only a per-document
  signature-requests endpoint exists, no tenant-wide list.
- **Charts of any kind** — no charting library installed, no
  chart-shaped data exists; matches `UI_PATTERNS.md`'s pre-existing
  TASK-0016 note.
- **A full extension-request/damage-report triage UI** — the "Needs
  attention" metric surfaces only a permission-gated count; building
  the list-and-approve workflow for those two features (real,
  existing endpoints with zero UI consumers before this chapter) is a
  separable follow-up task.

## The productivity layer — added Chapter 5

One reusable layer on top of the existing `CommandItem`/
`QuickActionDefinition` seams from Chapter 1, rather than a second,
competing system — see `UI_REDESIGN_PLAN.md` Chapter 5 for the full
design rationale behind every decision below.

| File                                                                      | Purpose                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/keyboard-shortcuts.ts`                                               | `KeyboardShortcut` type, `isEditableTarget()` (suppresses shortcuts while any text field/contenteditable has focus), `matchShortcut()` — pure, chord-aware (`G` then `C/R/A/D/Q`), fully unit-tested.                                                |
| `hooks/use-keyboard-shortcuts.ts`                                         | `useKeyboardShortcuts(shortcuts)` — one global `keydown` listener, chord state via `useRef` with a 1s timeout.                                                                                                                                       |
| `hooks/use-app-shortcuts.ts`                                              | Builds the app's real 9-shortcut set (`Cmd/Ctrl+K`, `/`, `N`, `Shift+?`, `G C/R/A/D/Q`) — the one place shortcuts are registered; adding a new one never touches the dialogs/pages that consume them.                                                |
| `lib/search-providers.ts`                                                 | `SearchProvider` interface (pluggable, permission-aware) + `SEARCH_PROVIDERS`, five real, working providers (Customers, Assets, Rentals, Quotes, Documents), each calling the exact endpoint its own list page already uses.                         |
| `lib/recent-items.ts` / `hooks/use-recent-items.ts`                       | `localStorage`-backed, namespaced per user+tenant (`useSyncExternalStore`, matching `use-dark-mode.ts`'s established pattern). Tracks both `"page"` and `"entity"` views, capped and deduplicated.                                                   |
| `lib/pinned-items.ts` / `hooks/use-pinned-items.ts`                       | One generic store serving both "Favorites" and "Pinned Items" from the spec — deliberately not two parallel implementations (see design decision 6).                                                                                                 |
| `components/shell/pin-button.tsx`                                         | `PinButton` — generic, entity-type-agnostic; instantiated on the 5 entity detail pages (Customers, Assets, Rentals, Quotes, Documents).                                                                                                              |
| `components/shell/command-palette.tsx`                                    | Rebuilt — never opens empty (Recent → Pinned → Quick Actions → Commands → Navigation when idle; Quick Actions → Pinned → Commands → Navigation → live Search results while typing), debounced multi-provider search, permission-filtered throughout. |
| `components/shell/shortcuts-help-dialog.tsx`                              | `Shift+?` surface — groups every registered shortcut by `groupKey`, platform-aware key rendering (`⌘` vs `Ctrl`).                                                                                                                                    |
| `hooks/use-dismissible-hint.ts` / `components/shell/dismissible-hint.tsx` | Generic, reusable "dismissed once, remembered forever, never blocking" primitive — not a coaching/onboarding engine (`PRODUCT_BIBLE.md` §8 names that as a separate, larger, un-built gap).                                                          |
| `components/shell/command-palette-hint.tsx`                               | The one real hint instance built on the primitive above: the `Cmd/Ctrl+K` tip in the sidebar.                                                                                                                                                        |
| `lib/platform.ts`                                                         | `isMacPlatform()` / `formatShortcutKeys()` — also fixed a real pre-existing bug where the sidebar's `⌘K` badge was hardcoded regardless of platform.                                                                                                 |
| `lib/command-types.ts`                                                    | Rewritten `CommandItem` (kinds: `navigate`/`action`/`recent`/`pinned`/`search-result`) — every kind already carries a plain `href` or `run()` closure a future AI agent could call without DOM interaction (design decision 9; no AI code written).  |

`lib/quick-actions.ts` (Chapter 4) gained a 6th entry (Create
Category) and is otherwise unchanged — still the single source of
truth shared by `QuickCreate`, the dashboard's `QuickActions` widget,
and the palette's Quick Actions section.

### What Chapter 5 does not build (documented gaps, not fabricated)

- **Search providers for Users or Invoices** — no such pages/modules
  exist in the product yet (`VISION.md`'s "Planned, later phase"); a
  future provider implements the exact same `SearchProvider`
  interface, no palette changes required.
- **A real AI agent** — only the extension points named above (design
  decision 9).
- **A general onboarding/coaching engine** — `DismissibleHint` is one
  reusable primitive with one real instance, not a tour/tooltip
  system; `PRODUCT_BIBLE.md` §8 already names that as a separate gap.

## Smart Timeline and Entity Summary — added Chapter 6

Replaces the four independently hand-rolled `<ol>` blocks (Assets,
Rentals, Quotes, Documents — `UI_AUDIT.md` findings #37-38) with one
registry-driven component, and gives Customers a timeline/summary for
the first time (it never had one — `UI_AUDIT.md` finding #39). See
`UI_REDESIGN_PLAN.md` Chapter 6 for the full design rationale.

| File                                                           | Purpose                                                                                                                                                                                                                                        |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types/timeline.ts`                                            | `TimelineEvent<TType extends string>` — the one frontend envelope generic; deliberately declared separately from `@rentos/shared`'s backend equivalent, preserving the established mirror-type convention (`HANDOVER.md`).                     |
| `lib/timeline-registries.ts`                                   | `TimelineEventConfig` (icon + i18n label key + optional tone) and one `Record<Type, Config>` registry per entity (Asset/Rental/Quote/Document/Customer) — the single source of truth `<Timeline>` reads, never entity-`if` branches.           |
| `components/timeline/timeline.tsx`                             | `<Timeline>` — client-side search (shown past 5 events) + day grouping ("Today"/"Yesterday"/date) + arrow-key navigation between items + optional `getHref` for one-click navigation to a related entity + a `DismissibleHint` on first use.   |
| Backend: `packages/shared/src/timeline.ts`                     | `TimelineEvent<TType>` generic backend envelope — Asset/Rental/Quote/Document `timeline.types.ts` now alias it instead of independently redeclaring the same 4 fields.                                                                         |
| Backend: `customers/timeline.types.ts`, `.../summary.types.ts` | New `CustomerTimelineEvent`/`CustomerSummary` types; `CustomersService.timeline()`/`.summary()` — the timeline is sourced entirely from `AuditLog` (no synthetic events needed, since `customer.created/updated/deleted` are already audited). |
| Backend: `assets/summary.types.ts`                             | New `AssetSummary`; `AssetsService.summary()` computes `revenueGeneratedMinor` read-time via the existing `computeItemLineTotalMinor` pricing function — never a separately stored/recomputed total.                                           |

Entity Summary strips reuse Chapter 4's `DashboardGrid`/`DashboardMetric`
as-is (plus a bare `Card`+`CardContent` for money fields, since
`DashboardMetric.value` is `number`-only) — no new parallel component
family. Customer detail page also gained a real `PageHeader` (it had
none before; the whole page was just an inline edit form).

### What Chapter 6 does not build (documented gaps, not fabricated)

- **Overdue invoices, payment reliability, maintenance cost,
  utilization%** — no underlying data source exists for any of these
  (no invoicing/maintenance-cost model) — omitted from the summary
  types entirely rather than approximated.
- **Inline PDF/image/email preview inside Timeline items** — no such
  preview widget exists anywhere in the codebase yet; Timeline items
  navigate to the related entity in one click instead (`getHref`).
- **Quote Summary and Document Summary** — a deliberate scope
  decision, not an oversight; the reusable Entity Summary pattern
  makes adding them later straightforward.
- **Real email implementation, apartment/room/etc. rental object
  types, any AI implementation** — architecture-only per the task
  spec; nothing built this chapter.

## Rental Workspace — added Chapter 7

Rebuilds the Rental detail page from a plain CRUD form + Chapter 6
summary strip into an operational workspace surfacing every real
relationship a rental has — Customer, Assets, source Quote, linked
Documents, financial totals, and the unchanged Chapter 6 Timeline. See
`UI_REDESIGN_PLAN.md` Chapter 7 for the full design rationale and
`UI_RESEARCH.md`/`UI_AUDIT.md`'s Chapter 7 addenda for the research
this was built on.

| File                                         | Purpose                                                                                                                                                                                                                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend: `rentals/rental.types.ts`           | `RENTAL_DETAIL_INCLUDE` gains `sourceQuote` (id/quoteNumber) and `documents` (non-deleted, newest first) — both real, existing Prisma relations that `findOne()` simply never included before; no new endpoint, no new permission.                                                            |
| `lib/rental-time-intelligence.ts`            | `getRentalTimeIntelligence()` — one pure, centralized function deriving a closed set of date-relative labels (`starts_today`/`starts_in_days`/`days_remaining`/`overdue`/etc.) from status + planned dates; never a persisted value.                                                          |
| `components/rentals/rental-status-badge.tsx` | `<RentalStatusBadge>` — the one colored status badge, reused by both the Workspace and the rentals list page (`PRODUCT_BIBLE.md` §10); tone mapping reuses `Alert`'s existing semantic tokens, no new color introduced.                                                                       |
| `app/app/rentals/[id]/page.tsx`              | Rebuilt: header (status badge + time-intelligence chip + date range), Smart Summary (rental value/deposit/assets/time-status), Customer card, enhanced Assets card (asset link + status + price), consolidated Documents card, unchanged Details/Financial cards, unchanged Timeline sidebar. |
| `app/app/rentals/page.tsx`                   | Status column now renders `<RentalStatusBadge>` instead of plain translated text.                                                                                                                                                                                                             |

### What Chapter 7 does not build (documented gaps, not fabricated)

- **A staff-facing "extend rental" route** — `RentalsService.extendPlannedEnd()`
  exists and is fully tested, reachable only from the customer-portal
  extension-approval flow today; not requested this chapter, so no new
  route was added (`ARCHITECTURE_LOCK.md` "no unrequested surface area").
- **Any payment/invoice/"amount paid" UI** — no `Invoice`/`Payment`/
  `Transaction` model exists anywhere in the schema.
- **A "Send" action duplicated inside the Workspace** — the real,
  already-shipped send capability lives one click away on the Document
  detail page; the Documents card links there instead of re-implementing it.
- **Rental/return reminders, a calendar/scheduling view, new
  availability-conflict detection, a new keyboard shortcut, or any
  apartment/property-specific fork** — each evaluated and explicitly
  not needed; see `UI_REDESIGN_PLAN.md` Chapter 7 design decisions
  8–12 for the reasoning behind each.

## Quote Workspace — added Chapter 8

Rebuilds the Quote detail page from a plain CRUD form into an
operational workspace surfacing every real relationship a quote has —
Customer, Assets/line items, converted Rental (if any), linked
platform Documents, financial totals, and the unchanged Chapter 6
Timeline. Mirrors the Rental Workspace's shape (Chapter 7) wherever the
underlying domain concept is structurally the same. See
`UI_REDESIGN_PLAN.md` Chapter 8 for the full design rationale and
`UI_RESEARCH.md`/`UI_AUDIT.md`'s Chapter 8 addenda for the research
this was built on.

| File                                       | Purpose                                                                                                                                                                                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend: `quotes/quote.types.ts`           | `QUOTE_DETAIL_INCLUDE` gains `platformDocuments` (non-deleted, newest first) — a real, existing `Quote.platformDocuments` relation that `findOneRaw()` simply never included before; no new endpoint, no new permission. `convertedRental` was already included. |
| `lib/quote-validity-intelligence.ts`       | `getQuoteValidityIntelligence()` — one pure, centralized function deriving a closed set of validity labels (`expires_today`/`expires_in_days`/`expired`/`accepted`/etc.) from status + `validUntil` + `nowMs`; never a persisted value.                          |
| `components/quotes/quote-status-badge.tsx` | `<QuoteStatusBadge>` — the one colored status badge, reused by both the Workspace and the quotes list page (`PRODUCT_BIBLE.md` §10); tone mapping reuses `Alert`'s existing semantic tokens, no new color introduced.                                            |
| `app/app/quotes/[id]/page.tsx`             | Rebuilt: `PageHeader` (status badge + validity chip + valid-until date), Smart Summary (quote value/deposit/items/validity status), Customer card, enhanced items table (discount/tax columns + asset links), consolidated Documents card, unchanged Timeline.   |
| `app/app/quotes/page.tsx`                  | Status column now renders `<QuoteStatusBadge>` instead of plain translated text.                                                                                                                                                                                 |

### What Chapter 8 does not build (documented gaps, not fabricated)

- **Real customer-facing quote acceptance inside the Customer Portal**
  — the portal has zero quote exposure today; the existing public-token
  link (`/quote/[token]`) and the portal's authenticated-session model
  are structurally different trust mechanisms and were not conflated.
  The future flow (staff sends → customer authenticates in-portal →
  views/accepts/rejects → Timeline records it → staff sees the result)
  is documented in `UI_RESEARCH.md`, not built.
- **A new "Send" UI beyond the existing button** — real (if
  placeholder-backed) email infrastructure already exists
  (`EmailService`/`LoggingEmailProvider`); no new UI was needed to
  satisfy the chapter's Email/Send Readiness requirement honestly.
- **Accounting, payment processing, an invoicing engine, e-signature
  platform, AI quote generation, or a property-management subsystem**
  — explicitly out of scope per the chapter's "do not overbuild"
  instruction; none of these have a backing model in the schema.
- **A new keyboard shortcut or a separate Quote search provider** —
  Quotes were already fully wired into the Chapter 5 keyboard registry
  and search-provider architecture; nothing needed adding.

## Documents Workspace — added Chapter 9

Applies the established `PageHeader`/`<EntityType>StatusBadge`/
related-entities pattern (Chapters 7/8) to the one standalone entity
page that never got it — the Document detail page (the Documents
_list_ page already had `PageHeader`+`DataTable`). Also closes the
"real FK relation, never surfaced" gap for two more entities
(`Asset.platformDocuments`, `Customer.documents`), and adds one pure,
real-data-only derived-intelligence util for a Rental's document
checklist. See `UI_REDESIGN_PLAN.md` Chapter 9 for the full design
rationale and `UI_RESEARCH.md`/`UI_AUDIT.md`'s Chapter 9 addenda for
the research this was built on.

| File                                             | Purpose                                                                                                                                                                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend: `assets/assets.service.ts`              | `AssetDetailView` gains `platformDocuments` (non-deleted, newest first) — a real, existing `Asset.platformDocuments` relation `findOne()` never included before; no new endpoint, no new permission.                          |
| Backend: `customers/customers.service.ts`        | `CustomerDetailView` (new) gains `documents` (non-deleted, newest first) — a real, existing `Customer.documents` relation `findOne()` never included before; no new endpoint, no new permission.                              |
| `components/documents/document-status-badge.tsx` | `<DocumentStatusBadge>` — the one colored status badge, reused by both the Workspace and the documents list page (`PRODUCT_BIBLE.md` §10); tone mapping reuses `Alert`'s existing semantic tokens, no new color introduced.   |
| `lib/document-completeness-intelligence.ts`      | `getRentalDocumentChecklist()` — one pure, centralized function deriving a closed set of checklist states (`present`/`missing`/`notRequired`) per document type from status + real linked documents; never a persisted value. |
| `hooks/use-documents.ts`                         | `useDocumentsSummary()` — real tenant-wide counts (total/draft/sent/signed) composed from the existing list endpoint's `.total`, the same `pageSize:1` technique `use-dashboard-stats.ts` established (Chapter 4).            |
| `app/app/documents/page.tsx`                     | Status column now renders `<DocumentStatusBadge>`; new Smart Summary strip (Total/Draft/Sent/Signed) above the filter bar.                                                                                                    |
| `app/app/documents/[id]/page.tsx`                | Rebuilt: `PageHeader` (status badge + one computed `primaryAction`), a new Related Entities card (Customer/Rental/Quote/Asset, only rendering relations that exist), unchanged Preview/Share/Email/Signature/Timeline cards.  |
| `app/app/assets/[id]/page.tsx`                   | New Documents card (`platformDocuments`), mirroring the Rental/Quote card's exact JSX pattern, honest empty state.                                                                                                            |
| `app/app/customers/[id]/page.tsx`                | New Documents card (`documents`), same pattern, honest empty state.                                                                                                                                                           |
| `app/app/rentals/[id]/page.tsx`                  | New Document Checklist card (Commercial Offer/Contract/Handover Protocol/Return Protocol), derived purely from real data, omitted for `CANCELLED` rentals; the existing Documents card is unchanged.                          |

### What Chapter 9 does not build (documented gaps, not fabricated)

- **An Invoice document type, or any payment/"amount paid" UI** — no
  `Invoice`/`Payment`/`Transaction` model exists anywhere in the
  schema (the same gap documented for Rentals in Chapter 7 and Quotes
  in Chapter 8).
- **Real e-signature integration** — `LocalMockSignatureProvider`
  remains the only implementation; "signing" stays a staff/customer-
  authenticated status flip, unchanged by this chapter.
- **Real SMTP/SES/SendGrid email delivery** — `LoggingEmailProvider`
  remains the bound implementation; a real provider is a future
  `useClass` swap behind the existing `EmailProvider` interface.
- ~~A drag-and-drop template designer — the existing raw HTML/CSS
  template editor already satisfies "templates exist and are
  editable"; a richer editor was not requested.~~ **Superseded by
  Pre-Chapter 10** — see "No-Code Document Template Builder" below.
- **A tenant-wide "documents awaiting signature" KPI or a background
  reminder job** — no cross-document aggregation beyond the per-status
  counts `useDocumentsSummary()` already composes exists; a scheduled
  reminder would require a background-job system, out of scope per
  `ARCHITECTURE_LOCK.md` §3.
- **A new keyboard shortcut or a separate Documents search provider**
  — Documents were already fully wired into the Chapter 5 keyboard
  registry and search-provider architecture; nothing needed adding.

## No-Code Document Template Builder — added Pre-Chapter 10

A Tiptap/ProseMirror-based visual block editor so a normal Havelio
user can author a professional contract template without HTML/CSS/
template-syntax knowledge — see `UI_PATTERNS.md`'s "Document Template
Builder" pattern for the full interaction spec and
`UI_REDESIGN_PLAN.md`'s Pre-Chapter 10 section for the design
rationale. Directly supersedes the "drag-and-drop template designer"
documented gap from Chapter 9 above.

| File                                                                                              | Purpose                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/document-variable-registry.ts` (+ backend twin)                                 | Centralized, parity-checked (`scripts/check-document-variable-parity.mjs`) catalog of every resolver-backed `{{dot.path}}` variable, grouped for the Insert field picker — mirrors the `permission.ts`/`permissions.ts` dual-registry convention. |
| `apps/web/src/lib/contract-section-library.ts`                                                    | 18 reusable section blocks (Parties, Rental Period, Payment Terms, ...) as ProseMirror-JSON fragments, plus `renderBlocksToHtml()`/`fullContractBlocks()`.                                                                                        |
| `components/documents/template-builder/template-builder.tsx`                                      | `TemplateBuilder` — the Tiptap `useEditor()` wiring, move-up/down/remove block reordering via direct `Fragment`/`replaceWith` transactions, top-level append via a position-based insert.                                                         |
| `components/documents/template-builder/extensions.ts`                                             | Custom Tiptap nodes: `DocSection`/`DocSectionTitle` (block container), `VariableChip` (inline, atom), `VariableBlock` (block-level, atom, for raw-HTML table variables).                                                                          |
| `components/documents/template-builder/variable-node-views.tsx`                                   | React node views rendering `VariableChip`/`VariableBlock` as readable, non-editable labels instead of `{{path}}`.                                                                                                                                 |
| `components/documents/template-builder/insert-field-menu.tsx`                                     | `InsertFieldMenu` — grouped popover over `document-variable-registry.ts`, a plain custom dropdown (no new Radix dependency).                                                                                                                      |
| `components/documents/template-builder/section-list.tsx`                                          | `SectionList` — the reorder/remove control list for top-level blocks.                                                                                                                                                                             |
| `lib/document-template-editor-format.ts`                                                          | `readBlocksV1Schema()`/`toBlocksV1Schema()` — recognizes/produces the `{editorFormat:"blocks-v1", blocks:[...]}` shape persisted in `DocumentTemplateVersion.variablesSchema`.                                                                    |
| Backend: `documents/rendering/variable-resolver.service.ts#buildPreviewContext`                   | Synthetic sample-data context (real tenant company data + clearly-labeled synthetic customer/asset/rental/quote data) for previewing a draft with no persisted Document.                                                                          |
| Backend: `documents/rendering/document-renderer.service.ts#renderPreviewHtml`                     | Renders draft HTML/CSS against the synthetic context via the same `resolveVariables`/document-shell pipeline a real render uses.                                                                                                                  |
| Backend: `documents/dto/preview-document-template.dto.ts` + `POST .../document-templates/preview` | Gated by `documents.templates.view` (read-only render, not `.manage`) so a viewer can preview a saved template too.                                                                                                                               |
| `apps/web/src/lib/rental-next-action.ts` / `quote-next-action.ts`                                 | Pure `getRentalNextAction()`/`getQuoteNextAction()`, mirroring the existing `getRentalTimeIntelligence`/`getQuoteValidityIntelligence` pattern; wired into each Workspace's `PageHeader` `primaryAction`.                                         |

`ConfirmDialog` (Chapter 3's `DataTable` system, see above) is
**reused, not re-built**, for the New Template page's "Start from
Havelio Rental Contract template" starter flow, confirming before
overwriting canvas content the user has actually started editing.

### What the no-code builder does not build (documented gaps, not fabricated)

- **Drag-and-drop block reordering** — deliberately simple move-up/
  move-down/remove buttons instead, per the approved plan's explicit
  preference; no drag-and-drop library was added.
- **Reverse-parsing arbitrary saved HTML into blocks** — any template
  whose current version's `variablesSchema` isn't recognized
  `blocks-v1` JSON (every template that predates this feature, or one
  last saved via the raw Advanced textarea) opens Advanced-only, with
  no Visual-mode toggle offered at all.
- **A loop/repeat/conditional template-engine feature** — the two new
  raw-HTML block variables (`rental.assetsTableHtml`,
  `quote.servicesTableHtml`) are a small, explicit, server-built
  allowlist, not a general templating primitive a tenant could invoke
  for arbitrary data.
- **Automatic legal translation of contract prose** — `DocumentTemplate.language`
  (D-062) lets a tenant maintain multiple language-specific templates;
  nothing auto-translates one template's prose into another language.

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
