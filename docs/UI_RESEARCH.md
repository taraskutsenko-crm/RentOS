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
