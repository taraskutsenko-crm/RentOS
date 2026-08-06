# Havelio UI Patterns

Every reusable interface pattern used anywhere in Havelio, documented
once here so it's implemented once in code. This is the pattern
reference [`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md) requires for
"UI visual design" work (an extensible area, no ADR needed to follow
it) — see [`BRAND_GUIDELINES.md`](BRAND_GUIDELINES.md) for the token
values referenced throughout, and
[`UX_PRINCIPLES.md`](UX_PRINCIPLES.md) for the behavioral rules that
apply across all of these.

**Implementation status:** this document specifies the target pattern
set for TASK-0010 (Complete UI/UX Redesign) and beyond. As of TASK-0010
Part 2 Chapter 1 (Application Shell), `@rentos/ui` implements `Button`,
`Input`, `Label`, `Card`, `Alert`, `Skeleton`, `DropdownMenu`, and
`Dialog`; the staff shell additionally has real `Sidebar`,
`Breadcrumbs`, `PageHeader`, and `CommandPalette` components under
`apps/web/src/components/shell/` — see
[`UI_REDESIGN_PLAN.md`](UI_REDESIGN_PLAN.md) Chapter 1 for exactly
what shipped and what's deferred. As of Chapter 2 (Premium
Authentication Experience), `Alert` additionally has `success`/
`warning`/`info` variants (previously only `default`/`destructive`),
and every real account-entry screen shares the `Authentication`
pattern below, under `apps/web/src/components/auth/`. Every other
pattern below (Table, Tabs, DatePicker, Toast, Tooltip, Confirmation
dialog as a real component) is still per-page hand-written markup, not
yet a shared component; each pattern names its current state where
relevant.

For every pattern: **Purpose**, **When to use**, **When NOT to use**,
**Visual behavior**, **Keyboard behavior**, **Loading state**,
**Empty state**, **Error state**, **Disabled state**, **Mobile
behavior**.

---

## Navigation

**Purpose:** let a user move between the product's top-level areas
(Dashboard, Customers, Assets, Rentals, Quotes, Documents, Settings,
Customer Portal's own smaller set) without losing their place.

**When to use:** exactly one navigation instance per shell (staff app
shell, customer portal shell) — see Sidebar below for the staff
shell's implementation; the customer portal today uses a top nav bar
instead (see `apps/web/src/app/portal/(shell)/layout.tsx`) since it
has far fewer top-level areas.

**When NOT to use:** never duplicate navigation inside a page body —
in-page section jumps use Tabs, not a second nav.

**Visual behavior:** the active item is marked by `Primary` text/icon
color plus a `Primary`-colored left border or underline (never
background-fill alone, which reads as a hover state); inactive items
use `Muted` text that transitions to `Text` on hover at
`--duration-fast`.

**Keyboard behavior:** every nav item is a real link, reachable by
Tab in DOM order; `Enter`/`Space` activates the focused item;
skip-to-content is available as the first focusable element on the
page for keyboard/screen-reader users.

**Loading state:** navigation itself never shows a loading state — it
is static chrome; the content area beneath it loads independently
(see Skeletons).

**Empty state:** not applicable — nav items are fixed by the current
user's permissions, never empty.

**Error state:** not applicable.

**Disabled state:** a nav item the user lacks permission for is
omitted entirely, never shown disabled/grayed-out — per
`UX_PRINCIPLES.md`'s "never show what a user can't act on."

**Mobile behavior:** collapses into a slide-over drawer triggered by a
header hamburger control below the `md` breakpoint; the drawer closes
on navigation or on an outside tap.

---

## Sidebar

**Purpose:** the staff app's primary navigation surface, persistently
visible on desktop.

**When to use:** the one staff-app shell layout only — implemented as
of TASK-0010 Part 2 Chapter 1
(`apps/web/src/components/shell/sidebar.tsx`, wired into
`apps/web/src/app/app/layout.tsx`), replacing the previous flat
top-bar link list.

**When NOT to use:** the Customer Portal, which has few enough
top-level areas that a top nav bar (already implemented) remains
correct — don't force a sidebar where a simpler pattern already fits.

**Visual behavior:** `Sidebar` surface color (one step off
`Background`, per `BRAND_GUIDELINES.md`), fixed width on desktop, no
shadow (it's flush against the page, not floating).

**Keyboard behavior:** same as Navigation above.

**Loading state:** static; unaffected by page-content loading.

**Empty state:** not applicable.

**Error state:** not applicable.

**Disabled state:** not applicable (permission-gated by omission, as
above).

**Mobile behavior:** collapses to the same slide-over drawer described
under Navigation.

---

## Header

**Purpose:** page-level context (title, breadcrumb where relevant)
plus global actions (search trigger, notifications, dark-mode toggle,
account menu).

**When to use:** once per shell, sticky to the top of the viewport.

**When NOT to use:** never repeat page title text in both the header
and the page body — the header's title _is_ the page title.

**Visual behavior:** `Surface` background with a `--shadow-1` on
scroll (flat when the page is scrolled to the top, to avoid a
permanent hairline competing with content) — the Customer Portal
shell already implements the sticky + backdrop-blur variant of this.

**Keyboard behavior:** global actions are reachable by Tab before the
page's own content (logical DOM order: skip-link → header actions →
nav → main content).

**Loading state:** the account/tenant name area shows a skeleton
pill while `useMe()`/`usePortalMe()` resolves; global action icons
render immediately (they don't depend on that data).

**Empty state:** not applicable.

**Error state:** if the session check fails, the shell redirects to
login — no error UI renders in the header itself (already the
pattern in both `apps/app/layout.tsx` and the portal shell).

**Disabled state:** not applicable.

**Mobile behavior:** collapses non-essential actions (e.g. tenant
name) behind the account menu to keep the header to a single row.

---

## Authentication

**Purpose:** the presentation layer for every real account-entry
screen — staff login, staff registration/tenant onboarding, tenant
selection, customer-portal login, customer-portal invitation
activation — unified so a fix to spacing, branding, or error-alert
style is made once, not five times. Implemented as of TASK-0010 Part 2
Chapter 2 under `apps/web/src/components/auth/`:
`AuthShell`/`AuthBrandPanel` (the two-region page layout),
`AuthCard`/`AuthHeader`/`AuthFooter` (the card and its title/subtitle/
link-row slots), `AuthField`/`PasswordField` (label + input + error,
the latter adding a visibility toggle), `AuthAlert` (the top-of-form
error banner), `AuthSuccessState` (the one genuine new-account welcome
moment, used by customer-portal activation only). See
[`UI_REDESIGN_PLAN.md`](UI_REDESIGN_PLAN.md) Chapter 2 for the full
design rationale, including the two flows this chapter deliberately
does **not** build (staff invitation into an existing tenant, password
recovery) because no backend capability exists for either — see
`UI_AUDIT.md` findings #13–14.

**When to use:** exactly the five real pages named above, plus any
future real auth screen (password reset, once a backend exists) —
`AuthShell`/`AuthCard`/`AuthField` are the ready-made foundation for
it.

**When NOT to use:** never for authenticated in-app content — this
pattern is exclusively for the pre-session, public account-entry
surface. Don't add a sixth independent `<main className="flex
min-h-screen items-center justify-center p-8">` block; extend this
pattern instead.

**Staff/customer visual distinction:** one shared component tree, two
tones. `<AuthShell tone="primary">` (staff: `/login`, `/register`,
`/app/select-tenant`) uses a saturated `Primary`-filled brand panel;
`<AuthShell tone="sidebar">` (customer portal: `/portal/login`,
`/portal/invite/[token]`) uses the softer `Sidebar` surface tone,
consistent with `BRAND_GUIDELINES.md`'s "Customer Portal is slightly
warmer, never less precise" voice rule. This is a tone/copy
difference only — `portal.auth.*` keys already read second-person and
warmer than `auth.*`'s staff copy; no second component tree exists.

**Validation pattern:** identical to Forms above — Zod schemas
(`lib/validation.ts`), `react-hook-form`, field-level errors rendered
beneath their field via `AuthField`'s `error` prop, validated on
submit (client-side rules mirror the server's, e.g. the 12-character
minimum password), never only after a failed API round-trip when the
client already had enough information.

**Security-safe error pattern:** the top-of-form `AuthAlert` renders
whichever message the existing, unmodified error-mapping helpers
return — `apiErrorKey()` (staff: maps known backend messages to
translation keys) or `apiErrorMessage()` (portal: shows the backend's
own already-generic message, e.g. "Invalid email, password, or
company," with a translated fallback for non-`ApiError` failures).
Neither helper's logic changed in Chapter 2 — only the visual
presentation was unified. No screen in this pattern ever reveals
whether a specific account exists, an invitation token's underlying
tenant/customer identity before a successful activation, or any raw
token value.

**Loading/success pattern:** the submit button's label swaps to its
pending-label variant and disables (matching Forms' existing
convention) — no full-page spinner. The one true success moment
(customer-portal activation) replaces the form with `AuthSuccessState`
showing the actual tenant name returned by the successful API
response, then redirects after a short, real pause (not instant) so
the confirmation is genuinely perceived — see `UX_PRINCIPLES.md` rule 20. Login and registration redirect immediately on success, unchanged
from prior behavior, since they have no comparable "first time"
moment to mark.

**Responsive behavior:** the brand panel is a full-height left column
at `lg` and above, collapsing to a compact top strip (wordmark only,
tagline hidden) below `lg` — brand presence never disappears, per
`BRAND_GUIDELINES.md`'s "no giant empty panel" rule applied to small
screens. `AuthField` rows that were two/three columns on desktop
(register's name and language/currency/timezone rows) collapse to one
column below `sm`, per Forms' existing mobile rule (this fixed a real
pre-Chapter-2 bug — see `UI_AUDIT.md`).

**Accessibility:** every field uses real `<label htmlFor>`/`id`
pairing (via `AuthField`), `aria-invalid` and `aria-describedby` wired
to the field's own error id, the password-visibility toggle is a real
focusable button with a translated `aria-label` ("Show password"/"Hide
password," `common.showPassword`/`common.hidePassword`) that updates
as its state changes, and the error alert is a `role="alert"` region
(via the shared `Alert` primitive) so it's announced without a
separate `aria-live` region.

**Mobile behavior:** covered under Responsive behavior above; every
screen was verified at 375×812 with no horizontal overflow and the
primary action remaining reachable.

---

## Tables

**Purpose:** the primary way staff scan and act on lists of records
(customers, assets, rentals, quotes, documents).

**When to use:** any list of more than ~5 records with more than one
comparable attribute per record.

**When NOT to use:** a list of fewer than ~5 items with a single
attribute is better served by a simple list — a table with mostly
empty columns reads as unfinished, not data-rich.

**Visual behavior:** `Surface` container with `--radius-md`, header
row in `Muted` Medium-weight uppercase-tracked text (per
`BRAND_GUIDELINES.md`'s table-header type role), `Border`-colored row
dividers (no zebra-striping — it adds visual noise this system
doesn't need at this density), row hover background
`--color-neutral-50`/dark equivalent at `--duration-fast`, numeric
columns right-aligned and in `font-mono` where they're identifiers
(document/rental numbers) or right-aligned Inter tabular figures
where they're money.

**Keyboard behavior:** each row's primary action (typically "View") is
reachable by Tab; column headers that are sortable are real buttons
announcing current sort direction via `aria-sort`.

**Loading state:** skeleton rows (see Skeletons) matching the real
row height and column count — never a spinner replacing the whole
table, which causes layout jump when data arrives.

**Empty state:** the full Empty State pattern (see below) rendered in
place of the table body, keeping the filter bar above it visible so
the user can adjust filters without losing context.

**Error state:** an inline `Alert` (danger variant) above the table
body, table omitted — never a partially-rendered table with broken
rows.

**Disabled state:** not applicable to the table itself; individual
row actions follow their own permission-gated disabled rules.

**Mobile behavior:** below `md`, tables collapse to a stacked-card
layout — one card per row, label/value pairs instead of columns —
rather than horizontal scrolling, which hides data from view.

---

## Cards

**Purpose:** group related content into a visually distinct,
scannable unit — the default container for dashboard stats, detail
page sections, and list items on mobile.

**When to use:** any self-contained cluster of related fields or a
single record's summary.

**When NOT to use:** don't wrap an entire page in one giant card —
cards group content, they don't replace page layout; and don't nest
a card inside a card (flatten the hierarchy instead).

**Visual behavior:** `Surface` background, `Border`, `--radius-md`,
`--shadow-1` at rest, `--shadow-2` on hover only if the card itself is
interactive/clickable (a static info card never gets a hover shadow —
that would falsely imply it's clickable).

**Keyboard behavior:** a clickable card is a real `<a>`/`<button>`
wrapping its content (not a `<div onClick>`), focusable and
Enter/Space-activatable.

**Loading state:** a skeleton card matching the real card's internal
layout.

**Empty state:** N/A at the card-shell level; content-specific (e.g.
a stat card with no data shows "—" per its own field, never an empty
card shell).

**Error state:** an inline danger-toned message replacing the card's
content, card shell unchanged.

**Disabled state:** reduced opacity (60%) plus `cursor-not-allowed` if
the card is normally clickable and currently isn't.

**Mobile behavior:** cards already stack full-width by default —
no special mobile variant needed beyond standard responsive padding
(one Spacing step down from desktop).

---

## Forms

**Purpose:** create/edit a record's fields.

**When to use:** any create/edit flow. Multi-step forms use the
Wizard pattern instead (see below) once the field count crosses
roughly 8–10 fields across distinct concerns (e.g. Rentals/Quotes).

**When NOT to use:** don't build a form for a single-field edit — use
inline editing or a simple dialog with one field instead.

**Visual behavior:** `Label` above `Input` (never beside it — vertical
stacking scans faster and is inherently responsive), one Spacing step
(16px) between fields, helper/error text directly beneath its field
in `Muted`/`Danger` respectively, required-field markers are a
`Danger`-colored asterisk immediately after the label text.

**Keyboard behavior:** natural Tab order top-to-bottom; `Enter`
submits the form from any single-line input unless that input is
itself a search/filter field that shouldn't trigger submission.

**Loading state:** the submit button shows its pending-label variant
(see Buttons under Forms) and disables itself; other fields remain
interactive unless the whole form is genuinely locked during submit.

**Empty state:** N/A — a form's "empty" state is simply its default
values.

**Error state:** field-level errors render beneath their field
(never a top-of-form-only error list disconnected from the fields);
a form-level error (e.g. a conflict the server rejected) renders as
an `Alert` above the first field.

**Disabled state:** an entirely read-only form (e.g. viewing a
non-`DRAFT` record) renders every input `disabled` with the same
visual treatment as `Input`'s existing `disabled:opacity-50` — never
hidden or replaced with plain text, so the layout doesn't shift
between editable and read-only states.

**Mobile behavior:** fields that were side-by-side on desktop
(e.g. a two-column date range) stack to one column below `md`.

---

## Filters

**Purpose:** narrow a table/list to a relevant subset.

**When to use:** any list view where the underlying record count
regularly exceeds what fits on one page.

**When NOT to use:** don't add a filter for a field with fewer than 2
realistic values — a filter that's always "All" is clutter.

**Visual behavior:** a horizontal filter bar directly above the table,
each filter a `--radius-sm` control (select or a small popover for
multi-value/date-range filters); active (non-default) filters are
visually marked (`Primary` border or a small count badge) so it's
obvious the list is currently narrowed.

**Keyboard behavior:** standard native `<select>`/button keyboard
behavior; a "clear filters" action is reachable and labeled, not just
an icon.

**Loading state:** the filter bar itself never shows a loading
state — only the table body beneath it does, so the user can keep
adjusting filters while a previous query finishes.

**Empty state:** N/A — see Table's empty state for "no results after
filtering."

**Error state:** N/A at the filter-bar level.

**Disabled state:** N/A — filters are always interactive.

**Mobile behavior:** the filter bar collapses into a single "Filters"
button opening a bottom sheet/dialog listing all filters vertically.

---

## Search

**Purpose:** find a specific record by free text, either scoped to
one list (a table's own search box) or global (command palette, see
below).

**When to use:** any list of records identifiable by a name/number a
user is likely to type from memory.

**When NOT to use:** don't add search to a list that's realistically
never longer than a screenful (e.g. the six locale rows in a settings
table) — filters and visual scanning already cover that.

**Visual behavior:** an `Input` with a leading search icon
(16px, `Muted`), placeholder text naming what's searched ("Search
customers…"), debounced query (300ms) rather than firing on every
keystroke.

**Keyboard behavior:** `Escape` clears the field and returns focus to
the field itself (not away from it); global search additionally
opens via a keyboard shortcut (see Command Palette).

**Loading state:** a small inline spinner replaces the search icon
while a debounced query is in flight.

**Empty state:** see Table's empty state, with copy specific to a
search yielding nothing ("No customers match 'x'") rather than the
generic "no records yet" copy.

**Error state:** falls back to the Table's error state.

**Disabled state:** N/A.

**Mobile behavior:** unchanged — search inputs are already
full-width-friendly.

---

## Command Palette

**Purpose:** one unified surface for global search, navigation, quick
actions, and commands — reachable from anywhere in the product without
using the mouse. See docs/UI_REDESIGN_PLAN.md Chapter 5 for the full
design rationale and docs/PRODUCT_BIBLE.md §6 (Power User Experience).

**When to use:** the single global instance mounted once in
`AppLayout` — never a second, page-scoped palette instance.

**When NOT to use:** a list page's own scoped search box (see Search
above) — the palette is for jumping anywhere, not filtering the
current table.

**Visual behavior:** a centered modal dialog, `Search` icon plus input
plus `Esc` badge in the header, results grouped under uppercase section
labels (Recent, Pinned, Quick actions, Commands, Pages, and one group
per search provider), each row showing an optional leading icon, a
label, and an optional muted description.

**Keyboard behavior:** opens via `Cmd/Ctrl+K` or `/` (see Keyboard
shortcuts below); `↑`/`↓` moves the active row; `Enter` executes the
active row; `Esc` closes (Radix `Dialog`'s built-in behavior). An empty
query never renders an empty list — it composes Recent + Pinned + Quick
Actions + Commands + Navigation, each permission-filtered.

**Loading state:** a small spinner replaces nothing in the header
input (the input stays interactive) while a debounced (300ms) search
provider query is in flight — matching Search's own inline-spinner
convention above.

**Empty state:** only reachable with a non-empty query that matches
nothing anywhere (no page, quick action, pinned item, or provider
result) — shown as "No matches found," never a blank list.

**Error state:** a provider whose request fails is silently excluded
from that query's results (caught per-provider) rather than breaking
the whole palette — one slow or failing entity search never blocks
Navigation/Quick Actions/Commands from still working.

**Disabled state:** N/A — the palette itself has no disabled state;
individual rows are simply omitted when the current user lacks the
underlying permission (per docs/UX_PRINCIPLES.md rule 17).

**Mobile behavior:** opened via the header's search icon button below
the `lg` breakpoint (the sidebar's own search trigger, and its
`Cmd/Ctrl+K` badge, are `lg`-and-up only); the dialog itself is already
responsive at any width.

---

## Keyboard shortcuts

**Purpose:** let a returning user complete any common action without
reaching for the mouse — see docs/PRODUCT_BIBLE.md §4 (One Click Rule)
and §6 (Power User Experience).

**When to use:** any action reachable from the global shell (open the
palette, create something, jump to a top-level page). Registered once
in `apps/web/src/hooks/use-app-shortcuts.ts` — adding a shortcut means
adding a registry entry, never touching the listener.

**When NOT to use:** a shortcut scoped to one specific page/form's own
interaction (e.g. a wizard step's own `Enter`-to-advance) stays local
to that component, not the global registry — the global registry is
for shell-level, product-wide actions only.

**Visual behavior:** every bound shortcut is discoverable two ways —
inline `kbd`-styled badges next to the control it replaces (the
sidebar's search trigger, the Command Palette's header), and the full
list in the Shortcuts Help dialog (`Shift+?`).

**Keyboard behavior:** single-key shortcuts (`N`, `/`) and the
Cmd/Ctrl-modified `K` fire immediately; two-key "go to" chords (`G`
then `C`/`R`/`A`/`D`/`Q`) wait up to one second for the second key
before resetting. Every non-modifier shortcut is suppressed while
focus is inside an `<input>`/`<textarea>`/`[contenteditable]`/
`role="textbox"` element, so normal typing is never intercepted.

**Loading state:** N/A.

**Empty state:** N/A.

**Error state:** N/A — an unbound key combination is simply not
handled; nothing is shown.

**Disabled state:** N/A — a shortcut's handler is always safe to fire
regardless of current page (e.g. a "go to Rentals" chord navigates
even if the destination page will itself show a Permission Denied
state — see Permission denied below).

**Mobile behavior:** not applicable — no on-screen keyboard exposes
these chords usefully, so shortcuts are a desktop-only affordance; the
Command Palette and Quick Create remain reachable by tap regardless.

---

## Pagination

**Purpose:** move through a list too long for one page, matching the
API's existing `{ items, total, page, pageSize }` contract used by
every list endpoint (`api.md`).

**When to use:** any list-returning endpoint — this is already
universal across the API, so pagination controls are always
available, never conditionally built per module.

**When NOT to use:** don't paginate a fixed, small, non-list dataset
(e.g. the six locale rows again).

**Visual behavior:** Previous/Next buttons plus a "page X of Y"
label, centered beneath the table — matches the pattern already used
on every existing list page today. Numbered-page links are not used
(the two-button pattern already shipped is intentionally kept — it's
simpler and correct for this product's typical result-set sizes).

**Keyboard behavior:** Previous/Next are real buttons, disabled
(not hidden) at the first/last page respectively.

**Loading state:** Previous/Next disable during the in-flight
request for the new page, re-enabling on response.

**Empty state:** pagination controls are hidden entirely when
`total === 0` (already the pattern in shipped pages).

**Error state:** N/A — falls back to the Table's error state.

**Disabled state:** covered under Visual behavior above.

**Mobile behavior:** unchanged — the two-button pattern is already
mobile-friendly.

---

## Tabs

**Purpose:** switch between multiple views of the _same_ record or
scope without navigating away (e.g. a document's Preview / Signature
Requests / History).

**When to use:** 2–5 mutually exclusive views of one entity.

**When NOT to use:** more than 5 tabs — that's a navigation problem,
not a tabs problem; don't use tabs for a sequential, ordered process
(use Stepper/Wizard instead).

**Visual behavior:** underline-style tabs, `Primary` underline + text
on the active tab, `Muted` text on inactive tabs, no background fill
on the tab strip itself.

**Keyboard behavior:** arrow-key navigation between tabs when the
tablist is focused (standard ARIA tabs pattern), `Home`/`End` jump to
first/last tab.

**Loading state:** each tab's content loads independently on first
activation (not all tabs pre-fetched eagerly); the active tab shows
its own Skeleton while loading.

**Empty state:** per-tab, using that tab's own content-appropriate
empty state.

**Error state:** per-tab, an inline `Alert` within that tab's panel.

**Disabled state:** a tab can be disabled (e.g. "Signature Requests"
before any exist) — shown at reduced opacity with a tooltip
explaining why, never hidden (hiding it would make the user think
the feature doesn't exist at all).

**Mobile behavior:** tabs become horizontally scrollable rather than
wrapping or shrinking to illegibility.

---

## Wizard

**Purpose:** guide a user through creating a complex record (Rental,
Quote) across multiple logical steps with validation at each step —
already implemented for both (`RentalWizard`, `QuoteWizard`).

**When to use:** a create flow with more than ~8 fields spanning
genuinely distinct concerns (customer → dates → items → pricing →
review, as today's two wizards already do).

**When NOT to use:** don't wrap a simple single-concern create form
(Customer, Asset) in a wizard — that adds friction the data doesn't
need; the existing `CustomerForm`/`AssetForm` single-page forms are
correct as they are.

**Visual behavior:** a horizontal Stepper (see below) above the
current step's form content; live pricing/summary feedback visible
throughout (already implemented via the client-side pricing-estimate
mirrors).

**Keyboard behavior:** `Enter` within a step advances only if that
step's fields validate; the Stepper's completed steps are clickable
to jump back.

**Loading state:** the final submit step shows the submit button's
pending state; earlier steps never show a loading state (they're
pure client-side form state until submission).

**Empty state:** N/A.

**Error state:** step-level validation errors block advancing (see
Forms); a submission error at the final step renders as an `Alert`
without losing the user's entered data.

**Disabled state:** "Next" is disabled until the current step
validates; already the pattern in both existing wizards via per-step
`trigger()`.

**Mobile behavior:** the Stepper collapses to a compact "Step 2 of 6"
label + progress bar rather than showing every step's label
horizontally.

---

## Stepper

**Purpose:** show progress through a Wizard's ordered steps.

**When to use:** exclusively as part of a Wizard — never standalone.

**When NOT to use:** don't use a Stepper to show a record's lifecycle
status (Rental status DRAFT→…→COMPLETED) — that's a Timeline/status
badge concern, not a Stepper (a Stepper implies the _user_ is actively
progressing through it right now; a lifecycle status is a record's
historical state).

**Visual behavior:** numbered circles connected by a line, `Primary`
fill on completed/current steps, `Neutral-300` on upcoming steps,
step labels beneath each circle (hidden on mobile per below).

**Keyboard behavior:** completed steps are focusable/clickable to
navigate back; upcoming (unvalidated) steps are not clickable.

**Loading state:** N/A.

**Empty state:** N/A.

**Error state:** a step with a validation error shows its circle in
`Danger` instead of `Neutral`/`Primary` until resolved.

**Disabled state:** upcoming steps are visually distinct
(`Neutral-300`) but not "disabled" in the form sense — they're simply
not yet reachable.

**Mobile behavior:** collapses to "Step X of Y" text + a thin progress
bar, per Wizard's mobile behavior above.

---

## Calendar

**Purpose:** show rentals/reservations across time — implemented
today as the Customer Portal's lightweight month grid
(`apps/web/src/app/portal/(shell)/calendar/page.tsx`); a broader
operations calendar (drag-and-drop planning across delivery/pickup/
service) is TASK-0013 scope, not this document's implementation, only
its visual language.

**When to use:** any date-range-heavy view where seeing multiple
bookings across days at once adds value over a table.

**When NOT to use:** don't use a calendar for a single date-range
input — that's a Date Picker (see below).

**Visual behavior:** a 7-column month grid, `Border`-divided cells,
today's cell marked with a `Primary` outline, each booking rendered
as a small `--color-neutral-100`-background pill (already the
Customer Portal's implementation) — colored pills reserved for
future status-differentiated bookings (e.g. a `Warning`-tinted pill
for a rental with a pending extension request), not decoration.

**Keyboard behavior:** arrow keys move focus between day cells when
the grid has focus; `Enter` on a day with bookings opens/focuses the
first booking.

**Loading state:** the grid renders immediately with empty cells;
bookings populate into cells once the underlying list query resolves
(already the Customer Portal calendar's behavior).

**Empty state:** a month with zero bookings still renders the full
grid (an empty calendar is informative — "nothing is booked" — not a
missing-data problem needing a dedicated empty-state message).

**Error state:** an inline `Alert` above the grid, grid itself
omitted if the underlying data failed to load.

**Disabled state:** N/A.

**Mobile behavior:** below `sm`, the grid compresses cell height and
truncates to showing only a count badge per day ("3") rather than
individual pills, tapping a day opens a list of that day's bookings.

---

## Timeline

**Purpose:** show a record's chronological history of events —
already implemented on every detail page (Rental/Document/Asset
timelines).

**When to use:** any record with a meaningful audit/status history a
user would want to review.

**When NOT to use:** don't use a Timeline for data with no
chronological meaning (e.g. a static list of a record's line items).

**Visual behavior:** a vertical list, each entry with a `Border`-left
accent line (already implemented as `border-l-2`), event label in
Medium weight, timestamp in `Muted` Caption size beneath.

**Keyboard behavior:** a plain focusable list; no special interaction
beyond standard scroll/read.

**Loading state:** 3–4 skeleton entries matching the real entry
layout.

**Empty state:** "No activity yet" text (already the pattern, e.g.
`asset.noTimelineEvents`), no illustration needed for a
sub-component-level empty state — illustrations are reserved for
full-page empty states per `BRAND_GUIDELINES.md`.

**Error state:** an inline `Alert` in place of the list.

**Disabled state:** N/A.

**Mobile behavior:** unchanged — a vertical list is already
mobile-friendly.

---

## Statistics cards

**Purpose:** surface a single important number at a glance (dashboard
metrics) — already implemented on the Customer Portal dashboard.

**When to use:** dashboard/summary screens showing 3–8 key numbers.

**When NOT to use:** don't use a stat card for a number that needs
context/comparison to be meaningful — use a Chart instead.

**Visual behavior:** per `BRAND_GUIDELINES.md`'s Chart Style "Metric
cards" rule — large Semibold number, `Muted` label beneath, optional
small delta indicator.

**Keyboard behavior:** if the card links to a filtered view of the
underlying data (e.g. "12 pending" → the pending-filtered list), it's
a real focusable link.

**Loading state:** the number position shows a skeleton block at the
number's approximate width.

**Empty state:** a genuine zero renders as "0", not blank or "—" —
"—" is reserved for "not applicable" (see Data Formatting rule in
`UX_PRINCIPLES.md`), which zero is not.

**Error state:** the number position shows "—" with a `Danger`-toned
tooltip explaining the fetch failed, rather than breaking the whole
dashboard layout.

**Disabled state:** N/A.

**Mobile behavior:** the stat-card grid reflows from its desktop
column count down to 2 columns, per standard responsive grid
behavior.

---

## Charts

See `BRAND_GUIDELINES.md`'s "Graph / chart style" for the full visual
spec. Not yet implemented anywhere in the product (Analytics &
Business Intelligence is TASK-0016) — this entry exists so the first
chart built follows the documented spec rather than inventing one ad
hoc.

**Purpose:** visualize a trend or comparison too dense for a stat
card or table to communicate at a glance.

**When to use:** trend-over-time or comparison data (TASK-0016's
revenue/utilization/profitability views).

**When NOT to use:** don't chart a single point-in-time number (use a
Statistics card) or a small enumerable list better scanned as a
table.

**Visual/Keyboard/Loading/Empty/Error/Disabled/Mobile:** all per
`BRAND_GUIDELINES.md`'s Graph style section; charts additionally need
a text-equivalent (a data table toggle or `aria-label` summary) for
screen-reader accessibility per this document's Accessibility rules
below.

---

## Dialogs

**Purpose:** a focused, blocking overlay for a task that shouldn't
lose the underlying page's context (a form, a detail view launched
from a list).

**When to use:** short, single-purpose tasks (2–4 fields) or content
review that returns the user to exactly where they were.

**When NOT to use:** don't use a dialog for a multi-step flow (use a
Wizard on its own page) or for content long enough to need its own
scroll position remembered across visits (use a dedicated page).

**Visual behavior:** `--shadow-modal`, `--radius-lg`, centered,
backdrop at 40% black regardless of light/dark mode (a backdrop is
always dimming toward black, never the theme's background color),
fade + scale-from-98% entrance at `--duration-slow` per the Motion
System.

**Keyboard behavior:** focus traps inside the dialog while open;
`Escape` closes it (unless it's a destructive-confirmation dialog
mid-submit); focus returns to the trigger element on close.

**Loading state:** the dialog's primary action button shows its
pending state; the dialog does not close until the action resolves
(success closes it; failure keeps it open with the error shown
inline).

**Empty state:** N/A at the shell level — content-specific.

**Error state:** an inline `Alert` within the dialog body, dialog
stays open.

**Disabled state:** the primary action is disabled until the dialog's
own form validates, matching Forms' behavior.

**Mobile behavior:** below `sm`, dialogs expand to a full-screen sheet
rather than a centered floating panel, to avoid an unusably small
centered box on a small viewport.

---

## Confirmation dialogs

**Purpose:** require explicit confirmation before an irreversible or
hard-to-reverse action (delete, cancel, revoke access).

**When to use:** exactly the destructive actions named in
`UX_PRINCIPLES.md`'s "never hide destructive actions" rule — today
implemented via `window.confirm(...)` as a stopgap (see
`HANDOVER.md`'s "Important frontend conventions") pending a real
Confirmation Dialog component, which is TASK-0010 scope.

**When NOT to use:** don't add a confirmation dialog to a reversible
action (e.g. changing a filter, toggling dark mode) — that trains
users to reflexively click through confirmations, defeating their
purpose.

**Visual behavior:** the Dialog pattern above, title states the
action ("Delete customer?"), body states the specific, concrete
consequence ("This can't be undone. All of their rental history stays
on record, but the customer record itself will be removed."), the
confirm button is labeled with the specific verb ("Delete customer,"
never generic "Yes"/"OK") in the `Danger` color for destructive
actions.

**Keyboard behavior:** as Dialog above; the default-focused button on
open is the safe one (Cancel), never the destructive one — a stray
`Enter` keypress must never trigger a destructive action.

**Loading/Empty/Error/Disabled/Mobile:** as Dialog above.

---

## Dropdowns

**Purpose:** a compact list of choices or actions triggered from a
button/field, without navigating away.

**When to use:** action menus (a row's overflow menu), single-select
fields with more options than a handful of radio buttons would
comfortably show.

**When NOT to use:** don't use a dropdown for fewer than ~4 mutually
exclusive options where a segmented control or radio group would be
faster to scan and select.

**Visual behavior:** `--shadow-dropdown`, `--radius-md`, `Surface`
background, options in Body type, hovered/focused option gets
`--color-neutral-50`/dark-equivalent background, a thin `Border`
separates destructive actions from the rest of an action menu.

**Keyboard behavior:** opens on `Enter`/`Space`/`ArrowDown` on the
trigger; arrow keys move through options; `Enter` selects; `Escape`
closes and returns focus to the trigger; type-ahead jumps to a
matching option by first letter.

**Loading state:** if options are fetched (not static), the dropdown
opens immediately showing a skeleton list rather than waiting to
open.

**Empty state:** "No options" text row, never an empty floating panel
with no content at all.

**Error state:** an inline error row if the options failed to load,
with a retry action.

**Disabled state:** the trigger itself follows Button's disabled
state; individual options can be disabled (grayed, non-selectable)
with a reason available via tooltip.

**Mobile behavior:** below `sm`, opens as a bottom sheet instead of a
floating panel anchored to the trigger, for reliable touch targets.

---

## Date pickers

**Purpose:** select a single date or date range (rental planned
dates, quote validity, extension request's new end date).

**When to use:** any date input — never a free-text date field.

**When NOT to use:** N/A — dates are always picked, never typed
freely, to guarantee a parseable, unambiguous value regardless of the
active locale's date format conventions.

**Visual behavior:** `--shadow-popover`, a single-month grid (range
selection shows two months side by side on desktop), selected
date/range in `Primary` fill, today outlined, out-of-range dates
(e.g. before an extension request's current end) shown at reduced
opacity and non-selectable.

**Keyboard behavior:** arrow keys move focus by day, `PageUp`/
`PageDown` move by month, `Enter` selects, `Escape` closes without
changing the current value.

**Loading state:** N/A — the calendar grid is pure client-side date
math, never a fetch.

**Empty state:** N/A.

**Error state:** an invalid range (end before start) is prevented at
selection time, not caught after the fact — the picker simply doesn't
let a user select an end date before the chosen start date.

**Disabled state:** matches `Input`'s existing disabled treatment.

**Mobile behavior:** single-month view always (never the two-month
side-by-side range layout, which doesn't fit a small viewport);
otherwise the same bottom-sheet treatment as Dropdowns.

---

## File upload

**Purpose:** attach images/documents (asset images, asset documents,
damage-report photos) — already implemented as native
`<input type="file">` per page today (e.g. the Customer Portal's
damage-report photo field).

**When to use:** any attach-a-file flow.

**When NOT to use:** don't build a custom drag-and-drop zone for a
single-file, low-frequency upload (e.g. one damage-report photo) —
the native file input is simpler and already fully accessible; a
richer drag-and-drop zone with preview thumbnails is worth building
specifically for the Assets module's multi-image upload, where the
frequency and volume justify it.

**Visual behavior:** a dashed `Border` drop zone (`--radius-md`) for
the multi-file case, showing accepted file types and the size limit
inline (matching `StorageService`'s real `MAX_IMAGE_SIZE_BYTES`/
`MAX_DOCUMENT_SIZE_BYTES` limits — never a UI limit that doesn't match
the server's actual enforcement).

**Keyboard behavior:** the drop zone is also a real, focusable,
`Enter`-activatable file-picker trigger — drag-and-drop is additive,
never the only way in.

**Loading state:** a progress indicator per file during upload;
already-uploaded files in the same batch show their thumbnail/name
immediately rather than waiting for the whole batch.

**Empty state:** "No files yet" plus the drop zone itself (which
functions as its own call-to-action, so no separate button is needed
inside an empty uploader).

**Error state:** a per-file error (wrong type, too large, server
rejection) shown beside that specific file, never blocking the other
files in the same batch from succeeding.

**Disabled state:** the drop zone is hidden (not grayed) when the
user lacks the relevant `*.manage_images`/`*.manage_documents`
permission — matching the "omit, don't disable" rule used for
Navigation.

**Mobile behavior:** the native file input already opens the
device's camera/gallery picker on mobile browsers with no additional
work needed.

---

## Comments

**Purpose:** threaded, timestamped communication attached to a
record — implemented today as the Customer Portal's Messages
(customer↔staff) rather than a generic "comments on any record"
feature.

**When to use:** exactly the customer-portal messaging use case
today; a general-purpose comment thread on other record types (e.g.
staff-only internal notes-as-a-thread on a Rental) doesn't exist yet
and isn't scoped — don't build one speculatively.

**When NOT to use:** don't use this pattern for a single free-text
notes field (Rental/Customer `notes`) — that's a Form field, not a
thread.

**Visual behavior:** already implemented — sender-aligned bubbles
(the sending party's messages align right in `Primary`/
`Primary-foreground`, the other party's align left in `Secondary`),
timestamp in small Caption text beneath each bubble.

**Keyboard behavior:** `Enter` in the composer sends (already the
pattern where implemented); `Shift+Enter` inserts a newline.

**Loading state:** the thread polls on an interval (already 15s in
`usePortalMessages`/`useStaffPortalMessages`) rather than a
persistent loading indicator; a skeleton renders only on first load.

**Empty state:** "No messages yet" (already implemented copy).

**Error state:** a failed send keeps the composed text in the input
(never clears it on failure) with an inline error beneath the
composer.

**Disabled state:** the composer is disabled while a send is in
flight, matching Forms' submit-pending behavior.

**Mobile behavior:** unchanged — the bubble layout is already
mobile-appropriate.

---

## Notifications

**Purpose:** persistent, revisitable records of things that happened
while the user wasn't looking — implemented today as the Customer
Portal's `CustomerNotification` list; no staff-side equivalent exists
yet (see `ARCHITECTURE_LOCK.md`'s technical-debt note on this).

**When to use:** any event a user would reasonably want to review
later, not just see once as a toast (see Toasts below for the
transient counterpart).

**When NOT to use:** don't create a notification for something the
user directly just did themselves in the current session (their own
action gets a Toast, not a Notification — a Notification is for
things that happened, possibly from someone else or the system).

**Visual behavior:** already implemented — unread items get a subtle
`--color-accent`-adjacent background tint (today `bg-accent/40`),
each item shows title/body/type/timestamp, a badge count on the
triggering nav icon.

**Keyboard behavior:** the list is a focusable list of links (already
the pattern — clicking a notification with a `link` navigates and
marks it read).

**Loading state:** skeleton list entries on first load.

**Empty state:** "You're all caught up" (already implemented copy —
a good example of the Voice rules: specific, calm, not cutesy).

**Error state:** an inline `Alert` in place of the list.

**Disabled state:** N/A.

**Mobile behavior:** unchanged — already a simple vertical list.

---

## Toasts

**Purpose:** transient confirmation that the user's own just-taken
action succeeded or failed, without requiring acknowledgment.

**When to use:** every mutation's outcome — today most pages instead
render an inline `Alert`/error string near the triggering control;
a real toast system is TASK-0010 scope (see `UX_PRINCIPLES.md`'s
"consistent notifications" rule for why this needs unifying).

**When NOT to use:** don't use a toast for something the user needs
to actively decide on (use a Dialog) or for a persistent record they
should be able to revisit later (use a Notification).

**Visual behavior:** bottom-right on desktop (top on mobile, to avoid
covering thumb-reachable controls), `--shadow-3`, `--radius-md`,
`Surface` background with a colored left border matching the
semantic outcome (`Success`/`Danger`/`Warning`/`Info`), auto-dismiss
after 4s for success, persistent-until-dismissed for errors (a user
must not miss why something failed).

**Keyboard behavior:** focusable and dismissible via a close button;
never steals focus from the user's current task on appearance.

**Loading state:** N/A — a toast appears once an action has already
resolved.

**Empty state:** N/A.

**Error state:** is itself the error-state UI for many actions — see
Visual behavior.

**Disabled state:** N/A.

**Mobile behavior:** full-width minus standard page margin, stacked
if more than one is active.

---

## Loading

**Purpose:** communicate that content is on its way, per
`UX_PRINCIPLES.md`'s "always show loading feedback."

**When to use:** any async data fetch longer than ~150ms
(`--duration-base` — below that, no loading UI is needed at all, per
the Motion System; flashing a spinner for 80ms is worse than showing
nothing).

**When NOT to use:** don't show a loading indicator for a
synchronous, instant client-side operation (e.g. opening a dropdown).

**Visual behavior:** prefer Skeletons (below) that match the
eventual content's shape over a generic spinner, which better
preserves layout stability and perceived speed; a spinner is
acceptable only for genuinely shapeless content (e.g. a full-page
initial auth check, already the pattern in both app shells' "Loading…"
text state — upgrading that plain-text state to a proper spinner/
skeleton is TASK-0010 scope).

**Keyboard/Empty/Error/Disabled:** not applicable to the loading
state itself.

**Mobile behavior:** unchanged — loading treatment doesn't vary by
viewport.

---

## Skeletons

**Purpose:** the specific loading treatment that mirrors real
content's shape — already used for table rows on several list pages
today (`bg-muted h-10 animate-pulse rounded-md`).

**When to use:** tables, cards, stat cards, and any other pattern
whose real layout is known ahead of the data arriving.

**When NOT to use:** don't build a skeleton for content whose shape
genuinely varies wildly between loads (rare in this product — most
lists have a predictable row shape).

**Visual behavior:** `--color-neutral-100` (dark: `--color-neutral-800`)
blocks at the real content's approximate dimensions, a gentle pulse
animation (`animate-pulse`, already Tailwind's default) — never a
shimmer/sweep animation, which reads as more "trendy" than "precise."

**Keyboard/Empty/Error/Disabled/Mobile:** not applicable.

---

## Empty states

See `BRAND_GUIDELINES.md`'s "Empty states" section for the required
five-part anatomy (headline, description, primary action, secondary
action, optional illustration). This entry covers layout only:
centered within its container (the table body, the dashboard card,
the page), generous vertical padding (`--spacing` step 48 desktop /
32 mobile) so it doesn't read as a rendering glitch.

---

## Error states

**Purpose:** communicate that something failed to load or an action
failed, per `UX_PRINCIPLES.md`'s "never surprise the user."

**When to use:** any failed fetch or failed mutation.

**When NOT to use:** don't show a full-page error state for a
partial failure (e.g. one widget on a dashboard failing shouldn't
blank the whole page) — isolate the error to the failed region only.

**Visual behavior:** an `Alert` in the `danger` variant (already
implemented), specific message text per `BRAND_GUIDELINES.md`'s Voice
rules (name what's wrong), a retry action where the failure is
plausibly transient (a network error) and no retry action where it
isn't (a 403).

**Keyboard behavior:** the retry action is a real, focusable button.

**Loading/Empty/Disabled:** not applicable to the error state itself.

**Mobile behavior:** unchanged.

---

## Permission denied

**Purpose:** the specific error state for a `403` — a valid record,
wrong permission.

**When to use:** whenever an API call returns `403` for missing
permission rather than `404` for tenant/record mismatch (see
`api.md`'s status-code conventions) — the UI's default posture,
per Navigation and File upload above, is to **not show the
action/route at all** if `usePermission(...)` already says no;
this state exists for the residual case where the server disagrees
with the client's momentarily-stale permission snapshot (e.g. a role
change mid-session).

**When NOT to use:** never as the default UX for "you can't do this"
— that's handled proactively by hiding the control, per
`UX_PRINCIPLES.md`.

**Visual behavior:** a calm, non-alarming message ("You don't have
permission to view this." — never "Access Denied!" or anything that
reads as a security-incident tone) with a link back to a page the
user _can_ access.

**Keyboard/Loading/Empty/Disabled/Mobile:** standard Error-state
behavior applies.

---

## Responsive behavior

Three breakpoints, Tailwind's defaults, unmodified (`sm` 640px,
`md` 768px, `lg` 1024px, `xl` 1280px):

- **Below `sm`:** single column everywhere, dialogs become full-screen
  sheets, tables become stacked cards, filter bars become a single
  "Filters" trigger.
- **`sm`–`md`:** two-column forms/grids where they were three+ on
  desktop.
- **`md` and above:** full desktop layout — sidebar visible, tables in
  native table form, multi-column forms.

No component ships without verifying its `sm` and `lg` rendering at
minimum, per `UX_PRINCIPLES.md`.

---

## Accessibility rules

- Every interactive element is a real semantic element (`<button>`,
  `<a>`, `<input>`) — never a `<div>` with a click handler and no
  role/keyboard support.
- Every `Input`/`Label` pair uses `htmlFor`/`id` (already the
  established convention per `PRODUCT_PRINCIPLES.md`'s "Accessible
  and responsive" principle).
- Color is never the only signal — every semantic color pairing
  (danger/warning/success/info) is always accompanied by text or an
  icon, never a bare color swatch/dot with no label.
- Focus is always visible (`--ring` token, never `outline: none`
  without a replacement focus style) and never trapped outside a
  Dialog's intentional focus trap.
- All text meets WCAG AA contrast against its background at the
  token level — `BRAND_GUIDELINES.md`'s dark-mode `Primary` lightening
  exists specifically to preserve this.
- Every icon-only control has an `aria-label`; every image has
  meaningful `alt` text or `alt=""` if purely decorative.
- Motion respects `prefers-reduced-motion` — every transition in the
  Motion System is a candidate for being skipped entirely (opacity/
  position set instantly) when that media query is active. Implemented
  for the `havelio-pop`/`havelio-fade` CSS utilities
  (`packages/ui/src/styles/theme.css`) that drive every dropdown/
  dialog/command-palette open-close transition as of TASK-0010 Part 2
  Chapter 1; plain Tailwind `transition-colors` hover states (sidebar
  links, buttons) do not yet check this media query — a small,
  low-risk follow-up for a later chapter.
