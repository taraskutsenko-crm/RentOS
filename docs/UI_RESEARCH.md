# UI Research — Premium SaaS Application Shells

Reference research for TASK-0010 (Complete UI/UX Redesign). This
document analyzes the well-known, publicly observable interaction
patterns of six premium SaaS products — Linear, Stripe Dashboard,
Vercel, Figma, GitHub, and Notion — to extract _principles_, not
pixels. **The goal is to reach the same product quality these tools
have, never to copy their specific visual design** — see
[`BRAND_GUIDELINES.md`](BRAND_GUIDELINES.md) for Havelio's own,
deliberately distinct color/typography identity, which this research
does not touch.

This is a synthesis of these products' generally known, widely
documented interaction conventions (the kind discussed in design
communities and visible to anyone who has used the products), not a
pixel-level teardown from live inspection — appropriate for
establishing _architecture and interaction principles_, which is what
this document exists to inform.

## What these six products have in common

Despite very different visual identities, all six share a small set
of structural conventions that read as "premium" regardless of color
palette:

1. **A persistent, collapsible left sidebar is the primary
   navigation surface**, not a top nav bar. Top bars are reserved for
   page-level context (breadcrumbs, search, account) — never
   duplicated as a second navigation system. Havelio's current staff
   shell only has a top bar (see `UI_AUDIT.md`) — this is the single
   biggest structural gap this chapter closes.
2. **A single global "go anywhere, do anything" surface**, opened by
   a keyboard shortcut (`Cmd/Ctrl+K` in Linear/Vercel/GitHub, `Cmd+K`
   in Notion, `/` in some), that unifies search and command execution
   rather than shipping them as two separate, competing surfaces.
   This is exactly the unification Havelio's own `UI_PATTERNS.md`
   independently arrived at for Search + Command Palette — this
   research confirms it's the right call, not a shortcut taken to
   save work.
3. **Breadcrumbs are minimal and never redundant with the page
   title** — they show _path_, the page header shows _what this page
   is_, and the two are never the same string repeated twice.
4. **The sidebar collapses to icons-only, never fully disappears on
   desktop** — collapsing trades label width for content width; it
   never hides navigation entirely on a screen large enough to show
   it.
5. **Active-state indication is a single, consistent visual signal**
   (a colored icon/text plus a left accent bar or filled background),
   never color alone, and never different between sections of the
   same product.
6. **The account/workspace switcher and the user-profile menu are two
   separate controls**, not one — "which company am I acting as" and
   "who am I, what are my personal settings" are different questions
   answered by different menus, typically the workspace switcher near
   the top of the sidebar and the profile menu at the bottom of the
   sidebar or top-right of the header.
7. **Empty/loading states use skeletons that mirror real content
   shape**, not generic spinners, keeping layout stable as data
   arrives — already a documented Havelio principle
   (`UI_PATTERNS.md`'s Skeletons pattern); this research confirms it
   against real precedent rather than inventing it in isolation.
8. **Motion is fast and purposeful** — sidebar collapse, dropdown
   open/close, and command-palette open all animate in well under
   250ms with no bounce/spring easing, matching
   `BRAND_GUIDELINES.md`'s existing Motion System exactly.
9. **Notifications live in their own bell-triggered panel**, distinct
   from toast-style transient confirmations — a persistent,
   revisitable list, not a place where the user's own just-completed
   action is announced (that's a toast's job).
10. **Keyboard accessibility is a first-class citizen**, not a
    retrofit — every one of these products supports full keyboard
    navigation of its sidebar, command palette, and menus, with
    visible focus rings that are never suppressed.

## Per-product notes (principles extracted, not visuals copied)

- **Linear:** the clearest example of sidebar + unified command
  palette (`Cmd+K`) as the entire navigation model — almost no
  breadcrumbs needed because the sidebar's hierarchy _is_ the
  breadcrumb. Extremely restrained use of color — one accent color,
  everything else neutral. Havelio's own one-accent-plus-neutrals
  palette (`BRAND_GUIDELINES.md`) already follows this discipline.
- **Stripe Dashboard:** a sidebar with icon+label rows, clear section
  grouping (with subtle group headers), and a persistent top bar
  carrying breadcrumbs, a global search trigger, and account
  controls. Notably dense but never cluttered — spacing discipline
  (Havelio's own fixed Spacing System exists for exactly this reason)
  is what keeps a data-dense financial product feeling calm rather
  than overwhelming.
- **Vercel:** a workspace/team switcher at the very top of the
  sidebar (above the nav items), reinforcing that "which
  workspace/tenant am I in" is answered before "where in the product
  am I" — directly informs this chapter's Tenant Switcher placement
  decision below.
- **Figma:** demonstrates that a sidebar can adapt its density
  (collapsed icon rail vs. expanded panel) without changing its
  underlying information architecture — the same items, just more or
  less label-visible.
- **GitHub:** breadcrumbs that are genuinely useful because they
  encode a real hierarchy (org → repo → section) rather than a
  cosmetic trail; global search doubles as a command surface (typing
  `>` before a query switches to command mode) — direct precedent for
  Havelio's own unified search/command surface.
- **Notion:** the strongest example of a "recent pages" and
  "favorites" architecture living directly in the sidebar, and of a
  command palette (`Cmd+K`) that mixes navigation, search, and
  action execution in one ranked list — the direct model for this
  chapter's Command Palette _foundation_ (see the architecture section
  in `UI_REDESIGN_PLAN.md`).

## What Havelio deliberately does not adopt

- **No dense multi-level flyout mega-menus** (some enterprise tools
  have these) — Havelio's information architecture is shallow enough
  (7 top-level areas today) that a flat sidebar with light grouping is
  sufficient; adding flyouts would be complexity the product doesn't
  need yet.
- **No colored per-section sidebar theming** (some tools tint each
  workspace a different color) — Havelio has one brand color and one
  accent, applied consistently everywhere, per `BRAND_GUIDELINES.md`'s
  explicit "never mix" rules.
- **No AI-suggested/algorithmic navigation ordering** — the nav order
  is fixed and predictable, matching `UX_PRINCIPLES.md` rule 30
  ("consistency beats local optimization").

## How this informs Chapter 1

See [`UI_REDESIGN_PLAN.md`](UI_REDESIGN_PLAN.md) for the concrete
Chapter 1 scope this research feeds into, and
[`UI_AUDIT.md`](UI_AUDIT.md) for exactly what in today's Havelio shell
falls short of the principles above.

## Data-table and filtering patterns — Chapter 3 addendum

New findings specific to data-heavy screens (tables, filters, bulk
actions), gathered for TASK-0010 Part 2 Chapter 3 (Universal Data
Views). Same discipline as above: principles observed across
Linear/Stripe/Vercel/Figma/GitHub/Notion's generally known, publicly
documented conventions — not a pixel-level teardown, and never copied
verbatim into Havelio's own visual language.

11. **A bulk-action toolbar appears contextually, replacing the normal
    toolbar, only once at least one row is selected** — it is never
    permanently visible with disabled buttons (per
    `UX_PRINCIPLES.md` rule 17's "enforced by omission" principle
    applied to selection state, not just permissions). Selecting zero
    rows shows the normal search/filter toolbar; selecting one or more
    swaps it for a count + actions.
12. **Row actions live in one overflow menu, not a row of icon
    buttons** — Linear, GitHub, and Notion all converge on a single
    "⋯" trigger per row (keyboard- and touch-friendly, and it scales
    to more actions without widening every row) rather than 3-4
    separate icon buttons competing for a narrow column. Havelio
    already has the primitive for this (`DropdownMenu`, built in
    Chapter 1) — Chapter 3 is its first use for row actions.
13. **Active filters render as removable badges/chips near the
    toolbar**, not just inside a filter panel — so a user scanning the
    page can see at a glance that the list is currently narrowed,
    matching `UX_PRINCIPLES.md` rule 11 ("filtering is always
    additive and always visibly reversible") and `UI_PATTERNS.md`'s
    existing Filters pattern, which already specified this but had no
    implementation to point to before Chapter 3.
14. **Column-header sort is a toggle among three states** (unsorted →
    ascending → descending → unsorted), indicated by a small arrow
    glyph next to the header label, never a separate sort control
    disconnected from the column itself — the pattern GitHub/Linear
    both use, and a clearer signal than Havelio's current one-off
    "sort by" `&lt;select&gt;` (used only on the Assets list today).
15. **A table's loading skeleton mirrors the real column count and
    approximate row height exactly**, including placeholder blocks
    sized per column type (a short block for a status badge column, a
    long block for a name column) — already Havelio's stated principle
    (`UI_PATTERNS.md`'s Skeletons pattern), this addendum only adds
    that the placeholder widths should vary per column, not be
    uniform, which reads as more deliberate and less like a generic
    loading spinner in table form.
16. **Sticky table headers are a scroll-container property, not a
    page property** — the header stays pinned while only the table's
    own row area scrolls, never the whole page; this requires the
    table to own a bounded, internally-scrolling region rather than
    growing to the page's natural height, a structural decision this
    chapter's `DataTable` component makes once, centrally.

## How this informs Chapter 3

See `UI_REDESIGN_PLAN.md` Chapter 3 for the concrete scope this
research feeds into, and `UI_AUDIT.md`'s addendum for exactly what in
today's list pages falls short of the principles above.

## Dashboard patterns — Chapter 4 addendum

New findings specific to dashboard/home screens, gathered for
TASK-0010 Part 2 Chapter 4 (Dashboard Experience). Same discipline as
above: principles observed across Linear/Stripe/Vercel/GitHub/Notion/
Clerk's generally known, publicly documented conventions, cross-checked
against what Havelio's own backend can actually produce today — a
dashboard pattern is only "adopted" here if a real, already-existing
API can feed it.

17. **A dashboard's stat-card row is a fixed, non-configurable
    top-of-page summary**, never a placeholder for arbitrary future
    metrics — Linear/Stripe/Vercel all ship a small number (4-6) of
    deliberately chosen KPIs rather than a generic "add a widget"
    surface. This matches `UI_PATTERNS.md`'s existing Statistics cards
    spec (already written, never implemented) and rules out an
    over-engineered configurable-widget dashboard for this chapter.
18. **"Recent X" list widgets are read-only previews of an existing
    list page, not a new feature** — every reference product's
    dashboard "Recent activity"/"Recent deploys"/"Recent issues" panel
    is the same list-page data, just the newest N rows with a "View
    all" link to the real list page. This directly confirms Chapter
    4's Recent Rentals/Recent Documents widgets should call the exact
    same list hooks (`useRentals`, `useDocuments`) the migrated
    `DataTable` pages already use, with `pageSize: 5` and no new query
    logic.
19. **A true cross-entity "activity feed" (mixing rentals, documents,
    quotes, customer actions into one chronological stream) requires a
    dedicated audit/event-log read path** — Linear and GitHub both
    back this with an events/audit table designed for that exact
    query. Havelio's `AuditService` (`apps/api/src/audit/`) is
    write-only today with no read endpoint anywhere (confirmed by
    grep) — so a genuine unified activity feed is **not** a
    reasonable same-chapter build without a new endpoint, which
    `ARCHITECTURE_LOCK.md` and this chapter's own scope forbid. This
    is the direct reason Chapter 4 ships two separate "Recent Rentals"
    / "Recent Documents" panels (finding #18) instead of one merged
    feed — documented as a gap, not fabricated as a merged stream.
20. **Empty and loading states are per-widget, not whole-page** — every
    reference dashboard renders its stat cards, its recent-items
    panels, and its quick-actions independently, each with its own
    skeleton/empty/error state, so one slow widget never blocks the
    rest of the page from rendering. This confirms the existing
    per-card loading discipline already specified in `UI_PATTERNS.md`'s
    Statistics cards section (loading/empty/error states listed
    per-card, not per-page) is the correct model for Chapter 4, and
    rules out a single page-level `isLoading` gate around the whole
    dashboard.
21. **Quick Actions are a small, fixed set of primary create-flows**,
    permission-gated per action, never a dynamically generated list —
    Linear's "New issue", Stripe's "Create payment", GitHub's "New
    repository" are each a single, well-known destination. This
    confirms Chapter 4's Quick Actions widget should link directly to
    the five existing `/app/*/new` create routes already gated by
    `usePermission()` on their own pages (see the route/permission
    table in `UI_REDESIGN_PLAN.md` Chapter 4), not invent a new
    action-selection UI.

## How this informs Chapter 4

See `UI_REDESIGN_PLAN.md` Chapter 4 for the concrete scope this
research feeds into, and `UI_AUDIT.md`'s addendum for exactly what in
today's two dashboard pages (`apps/web/src/app/app/page.tsx` and
`apps/web/src/app/portal/(shell)/dashboard/page.tsx`) falls short of
the principles above.

## Productivity-layer patterns — Chapter 5 addendum

New findings for TASK-0010 Part 2 Chapter 5 (Productivity Layer),
gathered against `docs/PRODUCT_BIBLE.md` §8, §9, and §20 (Productivity
Philosophy, Power User Experience, AI-Ready Architecture) — the first chapter
whose research is checked against `PRODUCT_BIBLE.md` before the
brand/pattern/UX documents, per that document's own reading order.

22. **A command palette's data model is a small, closed set of typed
    "kinds" composed together at render time** — Linear/GitHub/Notion/
    Vercel all converge on the same shape: recent items, pinned/
    favorite items, quick actions, and search results are different
    _sources_ feeding one _list_ component, not four different UI
    surfaces. Havelio's own `CommandItem`/`CommandKind` type
    (`apps/web/src/lib/command-types.ts`, added Chapter 1) already
    anticipates this — `"navigate" | "action" | "search-result" |
"recent-page"` — confirming the existing architecture is the
    correct seam to extend, not replace.
23. **Search providers are pluggable, not hardcoded per entity** — a
    palette that special-cases "if query looks like a customer, call
    the customers endpoint" doesn't scale past 2-3 entity types and
    can't be extended by a future module (or a future AI agent, see
    finding #25) without editing the palette itself. Every reference
    product instead registers a provider object per searchable
    category (label, icon, permission, a `search(query)` function)
    and the palette iterates the registry — the same "registry over
    hardcoding" shape Havelio already uses for `nav-registry.ts` and
    `lib/quick-actions.ts`.
24. **Keyboard shortcuts are declared, not scattered `keydown`
    listeners** — a single global listener dispatches to a registry of
    `{ keys, handler }` entries, so adding a shortcut never means
    editing the listener itself. Multi-key "chord" shortcuts (`G` then
    a second key, the "go to" pattern GitHub/Linear/Superhuman all use)
    require the registry to track a short-lived "awaiting second key"
    state, and — critically, confirmed by inspecting Havelio's one
    existing shortcut — every letter-key shortcut must be suppressed
    while focus is inside an `<input>`/`<textarea>`/
    `[contenteditable]`, or every text field in the product breaks the
    moment a second shortcut is added. Havelio's existing Cmd/Ctrl+K
    listener (`apps/web/src/app/app/layout.tsx`) has no such guard
    today — harmless only because `k` combined with a modifier key is
    never typed as plain text, which stops being true the moment a
    bare-letter shortcut (`N`, `G`, `/`) is added.
25. **AI-agent readiness means the same imperative surface a human
    interaction already calls, not a parallel "AI mode."** Every
    reference product's own copilot/AI-assist features (Notion AI,
    Linear's agents, GitHub Copilot Workspace) call the identical
    command/action/search objects the human command palette already
    exposes — this is the concrete shape behind `PRODUCT_BIBLE.md` §20's
    "without rewriting UI architecture" requirement, not a separate
    research finding: a well-typed `CommandItem`/`SearchProvider`/
    `QuickActionDefinition` registry _is_ the AI extension point,
    provided nothing about it assumes a human is the only caller (no
    DOM-only side effects, no assumption that "the active element" is
    meaningful).
26. **Discoverability hints are dismissed once, remembered forever, and
    never block interaction** — every reference product's onboarding
    coach-mark pattern is a small, non-modal callout anchored to the
    real control it's teaching (never a full-screen takeover), with a
    persisted per-user dismissal so it never reappears once seen. This
    is the concrete shape `PRODUCT_BIBLE.md` §8's "teach through usage,
    never a blocking tutorial" principle already commits to — Chapter 5
    is the first chapter to build any part of it.

## How this informs Chapter 5

See `UI_REDESIGN_PLAN.md` Chapter 5 for the concrete scope this
research feeds into, and `UI_AUDIT.md`'s addendum for exactly what
gaps exist in today's Command Palette, Quick Create, and keyboard
handling.

## Timeline and Summary patterns — Chapter 6 addendum

New findings for TASK-0010 Part 2 Chapter 6 (Smart Timeline, Smart
Summary), gathered by direct inspection of every backend timeline/
history method, every frontend timeline rendering block, and the
Chapter 4 dashboard-summary components — cross-checked against
`PRODUCT_BIBLE.md` §12 (Timeline First) before design work began.

27. **Four of five entities already have a timeline/history backend
    method — Customers has none.** Assets and Rentals name theirs
    `timeline()`; Quotes and Documents name theirs `history()`
    (`apps/api/src/{assets,rentals}/*.service.ts` vs.
    `apps/api/src/{quotes,documents}/*.service.ts`) — a real, existing
    naming inconsistency this chapter does not need to resolve (see
    Step 3 below for why). All four return the identical envelope
    shape independently declared four times: `{ id, type, occurredAt,
actorUserId, data: Record<string, unknown> }` — exactly the
    "independently implemented per module but never independently
    designed" gap `PRODUCT_BIBLE.md` §12 already names.
28. **Quotes and Documents already use the more scalable
    audit-to-timeline mapping shape; Assets and Rentals don't.**
    `quotes.service.ts`/`documents.service.ts` each declare one
    `AUDIT_ACTION_TO_TIMELINE_TYPE: Record<string, XTimelineEventType>`
    lookup table and query `AuditLog` with `action: { in:
Object.keys(...) }` — one query covers every audit-sourced event
    kind. Assets/Rentals instead run one separate `AuditLog` query per
    action string. The lookup-table shape is the correct one to
    standardize on: adding a new event kind is a one-line map entry,
    never a new query.
29. **Every frontend timeline rendering block is hand-rolled,
    line-for-line identical, and renders zero information beyond a
    translated label and a timestamp.** All four entity detail pages
    with timeline data (`apps/web/src/app/app/{assets,rentals,quotes,
documents}/[id]/page.tsx`) render the exact same `<ol>`/`<li>`
    markup independently. None of the four reads `event.data` at all
    — no icon, no color, no kind-based branching, no click-through to
    a related record. Reference products (Linear's issue activity
    feed, Stripe's event log, GitHub's PR timeline) all converge on
    the opposite shape: a kind-driven icon + color + one-line summary
    that reads `event.data`, grouped by day, with every item
    click-through-navigable to whatever it references.
30. **Customers has zero timeline UI and zero timeline endpoint, but
    already writes exactly the audit trail a timeline needs.**
    `customers.service.ts` already calls
    `AuditService.log({ action: "customer.created" | "customer.updated"
| "customer.deleted", ... })` on every mutation — the data a
    Customer timeline needs already exists, unused. This is the
    clearest "flagship feature with a real, fixable gap" finding of
    this chapter, not a hypothetical.
31. **No entity detail page shows any summary/stats block today** —
    confirmed by grep: `DashboardMetric`/`DashboardGrid`/
    `DashboardCard`/`DashboardSection` (Chapter 4) are used only on
    `apps/app/page.tsx`. Every detail page goes straight from a header
    (or, for three of five pages, no header component at all — see
    finding #32) into content cards. The Chapter 4 dashboard component
    family's props (`label`, `value`, `isLoading`, `isError`, `href`)
    are already entity-agnostic — nothing about them assumes
    tenant-wide scope. Reusing them for a per-entity summary strip is
    an extension of an existing seam, not a new component family
    (`PRODUCT_BIBLE.md` §16, Platform Extensibility).
32. **`PageHeader` (Chapter 1) is used by exactly one of five entity
    detail pages.** Only Rentals' detail page uses it
    (`apps/web/src/app/app/rentals/[id]/page.tsx`); Assets, Quotes, and
    Documents hand-roll a plain `<h1>`; Customers has no heading
    component at all. A Summary strip's natural position — directly
    below the page header — cannot be made consistent across entities
    while the headers themselves are inconsistent; this is a real,
    pre-existing gap Chapter 6 must close for the entities it touches,
    not a new problem it introduces.
33. **Money aggregation across many rentals must reuse the frozen,
    already-computed line-total function, never a fresh recomputation
    that risks disagreeing with a stored total.** `Rental.totalMinor`
    is already the canonical, stored, per-rental total (never
    recomputed after creation, per `ARCHITECTURE_LOCK.md` §1.5).
    `RentalItem` has no per-item stored total, only frozen unit-price/
    billing-mode/monthly-strategy snapshot fields — an asset-level
    revenue figure (a number that has never existed anywhere before)
    is only safely derivable by calling the existing, pure
    `computeItemLineTotalMinor(item, plannedStart, plannedEnd)`
    (`apps/api/src/rentals/rental-pricing.util.ts`) read-time over each
    of the asset's frozen `RentalItem` rows — the canonical function,
    not a second implementation, and not a mutation of any stored
    value.
34. **No document type has an inline binary PDF/image preview widget
    today.** The only preview UI in the codebase is the Documents
    detail page's HTML-in-`<iframe srcDoc>` render of server-generated
    HTML (`apps/web/src/app/app/documents/[id]/page.tsx`) — genuinely
    different from an embedded PDF/image viewer. Building one is a
    real, separate undertaking; Chapter 6's Timeline treats
    attachment/document/email events as one-click-navigate-to-the-
    entity (which already has its own preview, where one exists), not
    as inline-rendered media — matching the spec's literal
    "must open its related entity with one click," not "must render
    inline."
35. **`DocumentEmailDelivery` is the one and only per-entity email
    delivery model that exists** (`apps/api/prisma/schema.prisma`) —
    no `CustomerEmailDelivery`/`RentalEmailDelivery`/etc. exists.
    `EmailProvider`/`EmailService` (`apps/api/src/email/`) are already
    fully generic (`send(message: EmailMessage): Promise<EmailSendResult>`,
    one `LoggingEmailProvider` implementation) — a future
    per-entity delivery-history model would be a structural copy of
    `DocumentEmailDelivery`, not a new interface. This is the concrete
    shape behind this chapter's Email Foundation requirement (no new
    implementation, confirmed-ready seam).
36. **No settings page lists keyboard shortcuts — only a modal
    (`ShortcutsHelpDialog`, Chapter 5) does.** `apps/app/settings/`
    has exactly four subpages today (asset categories/fields/statuses,
    rental billing), none shortcut-related. A settings page is a
    genuinely different, complementary discoverability surface from a
    `Shift+?` modal — reachable via normal navigation/bookmarking, not
    only a keypress a user must already know exists.

## How this informs Chapter 6

See `UI_REDESIGN_PLAN.md` Chapter 6 for the concrete scope this
research feeds into, and `UI_AUDIT.md`'s addendum for exactly what
gaps exist in today's per-entity timeline/summary/discoverability
surfaces.

## Rental domain — Chapter 7 addendum

A full inventory of the rental domain as it actually exists today —
schema, service, pricing, availability, permissions, and frontend —
gathered before any redesign work, per `ARCHITECTURE_LOCK.md`'s "read
the repository first" contract. Every claim below is a verified fact
about the current codebase, not a plan.

**Schema (`apps/api/prisma/schema.prisma`)**

37. **`RentalStatus` has 7 values but only 6 are reachable.**
    `DRAFT | QUOTE | RESERVED | ACTIVE | RETURNED | COMPLETED |
CANCELLED` (`:58-66`) — `COMPLETED` is defined but no
    `RentalsService` method ever sets it; the real post-`ACTIVE`
    terminal state is `RETURNED`. A redesign must not imply
    `COMPLETED` is a real, reachable state.
38. **No deposit total is stored on `Rental` itself.** Deposit exists
    only per-`RentalItem` (`depositMinor`, `:843`); `Rental` has no
    `depositMinor`/`depositTotalMinor` column at all — the Chapter 6
    summary strip's "Total deposit" is already a client-side sum for
    exactly this reason, and any new UI showing deposit must keep
    summing, not assume a stored aggregate exists.
39. **`Rental.sourceQuoteId` is real, populated only by quote
    conversion, and completely unsurfaced on the frontend.**
    `sourceQuoteId String? @unique` (`:789`) with relation
    `sourceQuote Quote?` (`:800`); `Quote.convertedRental` is the real,
    documented inverse (`schema.prisma:979-981`). `apps/web/src/types/
rental.ts`'s `Rental` interface has no field for it at all (lines
    44-68) — the frontend doesn't even type this link, so even though
    the backend relation exists, nothing in the UI can reach it today.
40. **`Document.rentalId` is a real, direct, nullable FK** —
    `schema.prisma:1165`, indexed (`:1206`) — not an indirect link
    through line items. `Rental.documents Document[]` is the inverse
    side (`:804`). The rental detail page shows no documents section
    at all today.
41. **No `Invoice`/`Payment`/`Transaction` model exists anywhere.**
    Confirmed by a full-schema grep for those three terms: zero
    matches. Any "payment status"/"invoice total" UI would be
    fabricated data with nothing to back it.

**Service (`apps/api/src/rentals/rentals.service.ts`)**

44. **The real lifecycle, exactly as enforced today:**
    `create()` always starts `DRAFT` (`:70-144`); `reserve()` moves
    `DRAFT`/`QUOTE` → `RESERVED`, asserting availability first
    (`:410-436`); `start()` requires exactly `RESERVED` → `ACTIVE`,
    stamps `actualStart` (`:438-488`); `returnRental()` requires
    exactly `ACTIVE`, supports partial per-item returns via
    `itemIds`, only flips to `RETURNED` once every item is returned
    (`:490-566`); `cancel()` works from `DRAFT`/`QUOTE`/`RESERVED`/
    `ACTIVE` (`:568-636`). `remove()` (soft delete) only allowed from
    `DRAFT`/`QUOTE`/`CANCELLED` (`:385-408`).
45. **`extendPlannedEnd()` exists and is fully implemented and tested,
    but has no staff-facing REST route.** (`rentals.service.ts:320-383`)
    — reachable today only from
    `PortalExtensionRequestsService.approve` when staff approve a
    _customer's_ portal extension request. A staff member cannot
    extend a rental's planned end directly from the staff app; the
    capability exists in the service layer only.
46. **Availability is opt-in almost everywhere, not automatic.**
    `AvailabilityService` (`availability.service.ts`) is only invoked
    automatically at `reserve()` and for the newly-added tail window
    in `extendPlannedEnd()`. `create()` and a `DRAFT`/`QUOTE` `update()`
    never check availability — a draft can be freely created or edited
    into a double-booking; the real enforcement point is `reserve()`,
    which throws `ConflictException` naming every unavailable asset.
    The dedicated `GET /tenants/:tenantId/rentals/availability`
    endpoint (`rentals.controller.ts:64-78`) is advisory, used today
    only by the wizard's live per-asset feedback and the availability
    calendar page — it never blocks anything itself.

**Frontend (`apps/web/src/app/app/rentals/[id]/page.tsx`, as of Chapter 6)**

47. **The current detail page shows: header (number/customer-name-as-
    plain-text/status-as-plain-text), a deposit+days-remaining
    dashboard strip (Chapter 6), planned/actual dates + notes, an
    items table with no per-item price column, a financial summary
    (subtotal/discount/tax/total), and the shared Timeline.** It shows
    **zero** of: a customer link, a source-quote reference, a
    documents list, an asset detail link, a per-item rate, or any
    status color-coding.
48. **No entity in the product has a colored status badge today** —
    confirmed by grepping the Rentals, Quotes, and Documents list/
    detail pages for any status-to-color mapping: none exists.
    Every status renders as plain translated text everywhere it
    appears. `PRODUCT_BIBLE.md` §10's "a record's status renders
    identically everywhere it appears" is trivially satisfied today
    only because there is exactly one (colorless) rendering — a new
    colored badge introduced for Rentals must be applied everywhere
    a rental status renders (list + detail), not only the new
    workspace, to keep satisfying that rule rather than break it.
49. **The rentals list page wires only `search`/`status`/pagination as
    UI filters**, even though the API's `QueryRentalsDto` also
    supports `customerId`, `assetId`, `plannedStartFrom`/`To`
    (`rentals.service.ts:146-196`) — an existing, unused backend
    capability, not a gap to build against in this chapter.
50. **The availability calendar page** (`apps/app/rentals/
availability/page.tsx`) is a single-month, per-selected-asset day
    grid reading the same advisory `GET .../availability` endpoint —
    not a cross-asset scheduling/Gantt view, no drag-to-book, no
    click-to-create.

**Permissions** — `rentals.view/create/update/delete/reserve/start/
return/cancel` plus `rental_settings.view/manage`
(`permission.ts:35-46`), confirmed identical between backend and the
frontend mirror. `MANAGER` gets everything except `delete` and
`rental_settings.manage`; `TECHNICIAN` gets only `view/start/return`
(the two physically-handling-equipment transitions); `ACCOUNTANT`/
`VIEWER` get read-only.

**Testing** — `rentals.e2e-spec.ts` already covers the full lifecycle,
every billing mode, availability/double-booking rejection, partial
return, and the permission matrix. `rental-pricing.util.spec.ts`
covers every pricing branch including leap-year/DST/year-boundary
edge cases. Nothing about `sourceQuote`/`documents` surfacing exists
in any test today, since nothing surfaces them today.

## How this informs Chapter 7

`UI_REDESIGN_PLAN.md` Chapter 7 turns findings #40-43 into the
Rental Workspace's Documents section (a real, existing FK relation,
never built into UI before) and finding #48 into one reusable
`RentalStatusBadge` applied consistently everywhere a rental status
renders. Findings #37, #45, and #46 become explicitly documented
gaps/non-goals, not features invented to fill out the page — see
`UI_AUDIT.md`'s addendum for the full gap list.
