# Havelio Product Bible

The highest-level product document in this repository. It does not
replace [`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md),
[`BRAND_GUIDELINES.md`](BRAND_GUIDELINES.md),
[`UI_PATTERNS.md`](UI_PATTERNS.md), or
[`UX_PRINCIPLES.md`](UX_PRINCIPLES.md) — those remain the binding,
detailed references for architecture, visual identity, component
behavior, and interaction rules respectively, and this document does
not repeat their content. This document sits **above** them: it states
the product philosophy those four documents exist to serve, and gives
every future feature decision one place to be checked against before
any of the more detailed documents are consulted.

**Every future AI session and every future task must read this
document before implementing any feature** — before
`ARCHITECTURE_LOCK.md`, before `UI_PATTERNS.md`, before
`UX_PRINCIPLES.md`, before `BRAND_GUIDELINES.md`. Those four documents
tell you _how_ to build something correctly. This document tells you
_whether it should be built the way you're about to build it at all_.

This is the Constitution of the Havelio platform — it grows from the
most abstract question (why Havelio exists) to the most concrete one
(how you know a feature is actually finished), in four parts.

## Contents

**Part A — Vision & Identity**

1. [North Star](#1-north-star)
2. [Product Vision](#2-product-vision)
3. [Universal Rental Philosophy](#3-universal-rental-philosophy)
4. [Product Philosophy](#4-product-philosophy)

**Part B — How Havelio Behaves**

5. [Zero Friction Principle](#5-zero-friction-principle)
6. [One Click Rule](#6-one-click-rule)
7. [Simplicity Rule](#7-simplicity-rule)
8. [Productivity Philosophy](#8-productivity-philosophy)
9. [Power User Experience](#9-power-user-experience)
10. [Product Consistency](#10-product-consistency)
11. [Discoverability](#11-discoverability)
12. [Timeline First](#12-timeline-first)
13. [Communication First](#13-communication-first)

**Part C — Platform Architecture**

14. [API First](#14-api-first)
15. [Event-Driven Thinking](#15-event-driven-thinking)
16. [Platform Extensibility](#16-platform-extensibility)
17. [Plugin-First Principle](#17-plugin-first-principle)
18. [Marketplace Readiness](#18-marketplace-readiness)
19. [Product Ecosystem](#19-product-ecosystem)
20. [AI-Ready Architecture](#20-ai-ready-architecture)
21. [Long-Term Compatibility](#21-long-term-compatibility)

**Part D — Deciding and Shipping**

22. [Anti-Patterns](#22-anti-patterns)
23. [Customer Value Rule](#23-customer-value-rule)
24. [Decision Filter](#24-decision-filter)
25. [Product Decision Framework](#25-product-decision-framework)
26. [Ten-Year Rule](#26-ten-year-rule)
27. [Product Quality Checklist](#27-product-quality-checklist)

**Part E — Global Readiness**

28. [Global By Design](#28-global-by-design)

---

# Part A — Vision & Identity

## 1. North Star

**One Platform. Every Asset.** — `VISION.md`'s own tagline, and
Havelio's ultimate measure of success: any rental business, regardless
of what it rents, can run its entire operation on Havelio, from a
customer's first inquiry to the asset's final return, without needing
software custom-built for their vertical.

Every principle in this document exists to keep that sentence true.
When two principles below appear to conflict, the one that keeps
Havelio serving _any_ rental business wins over the one that would
optimize for a single vertical's convenience.

---

## 2. Product Vision

**What Havelio is:** a universal Rental Operating System — the
operational core a rental business runs on (bookings, pricing,
availability, commercial offers, documents, and a customer portal
today; contracts/handover, payments, and SaaS billing in later
phases), built so the same platform serves a vehicle-rental company,
a construction-equipment yard, an event-equipment supplier, a
tool-rental shop, an AV rental house, a furniture-rental business, or
a container/trailer operator — without forking the product or
hardcoding any one industry's vocabulary into the schema or the
business logic. See [`VISION.md`](VISION.md) for the full framing,
the problem being solved, primary users, and the
implemented/planned/long-term capability table.

**What Havelio is NOT:**

- Not a generic CRM or ERP with a rental feature bolted on.
- Not a per-vertical product (dedicated "car rental software," "tool
  rental software") — the universal asset model is the product bet,
  not a limitation to work around.
- Not a consumer app, a toy, or a marketing site dressed up as
  software (see `BRAND_GUIDELINES.md`'s Brand philosophy) — Havelio
  is built for a professional operator making real commercial
  decisions, and every product and design choice is judged against
  that fact.
- Not a platform that trusts the client for anything authoritative —
  pricing, permissions, and every derived financial number are always
  server-computed (`ARCHITECTURE_LOCK.md` §1.3), never a frontend
  estimate persisted as-is.

**The long-term vision:** an AI-first operational platform where AI
eventually _performs_ rental-operations workflows on the operator's
behalf (drafting a quote from a natural-language request, flagging an
asset likely to need maintenance, reconciling a return against
condition photos) — not merely answering questions about data that
already exists. This is a direction that biases today's architecture
choices (a well-typed, deterministic, independently callable internal
API; structured audit logs; explainable pricing), not a feature being
built speculatively now. See `VISION.md`'s "AI-first long-term
vision" and Section 20 of this document.

---

## 3. Universal Rental Philosophy

The operational rule Section 2's vision requires of every future
decision, restated as a test rather than a description.

**The test:** before adding a schema column, an enum value, or a
business-logic branch, ask — would this make sense for a
vehicle-rental company **and** a construction-equipment yard **and**
an event-AV house **and** a furniture-rental business? If the honest
answer is no, it belongs in tenant configuration (a custom field, a
category, a template), never in the schema or the code. This is
`ARCHITECTURE_LOCK.md` §1.1's three-industry test, restated here as a
product-level rule, not only an architectural one.

**What this rules out, concretely:** a feature named after one
industry's vocabulary ("VIN," "insurance waiver," "fuel surcharge")
anywhere in code, schema, or a permanent UI label; a workflow that
only makes sense for rentals measured in whole days (some businesses
price by the hour, some by the season); an assumption that every
asset has one fixed location (a portable-facility or trailer
operator's assets move).

**What this doesn't rule out:** industry-specific _presets_ — a
pre-built custom-field/category set for "vehicle rental," shipped as
tenant-configuration data, not code (`ARCHITECTURE_LOCK.md` §2). The
universal core stays universal; the convenience layer on top of it can
be as industry-flavored as it likes.

---

## 4. Product Philosophy

Havelio should **feel**: professional, calm, fast, trustworthy,
predictable, premium. It should **behave**: teach users naturally,
reward experience, reduce cognitive load. These are not separate
goals — they are one goal viewed from different angles: a professional
operator trusts software that never surprises them, and software that
never surprises them inevitably feels calm, fast, and premium at the
same time.

- **Professional / trustworthy / premium** is `BRAND_GUIDELINES.md`'s
  entire "Brand philosophy" section, made visual: the Stripe/Linear/
  Vercel test ("would this feel out of place next to their
  dashboards?"), no mascots, no decorative gradients, no more than one
  accent color on a screen at a time.
- **Calm / predictable** is most of `UX_PRINCIPLES.md`: nothing
  changes without the user asking (rule 5), destructive actions are
  confirmed not concealed (rule 2), notifications share one tone and
  vocabulary (rule 16), a record's status renders identically
  everywhere it appears (rule 24).
- **Fast** is the Zero Friction and One Click principles below, plus
  `UX_PRINCIPLES.md` rule 6's hard 3-click budget from the home screen
  to any common action.
- **Teach users naturally / reward experience / reduce cognitive
  load** is the Productivity Philosophy and Discoverability sections
  below — the parts of this document that are least implemented
  today and most load-bearing for future chapters.

When a proposed feature would make Havelio feel less calm, less fast,
or less predictable in service of looking more impressive, the
feature is wrong, not the principle.

---

# Part B — How Havelio Behaves

## 5. Zero Friction Principle

Every interaction should reduce friction. The user should never
wonder: **Did it save? Did it work? What should I do?**

**What this looks like, concretely:**

- **Skeleton loading**, not spinners-only or blank regions —
  `UI_PATTERNS.md`'s Skeletons pattern, already the standard for the
  `DataTable` system (Chapter 3) and the dashboard KPI/recent-activity
  widgets (Chapter 4): a skeleton mirrors the real content's shape
  (column widths, row height, card layout), never a generic
  placeholder.
- **Immediate feedback** for anything that takes longer than
  `--duration-base` (150ms) — `UX_PRINCIPLES.md` rule 3. A click
  always visibly registers.
- **Never blank pages** — `UX_PRINCIPLES.md` rule 19: every empty
  state names what's missing and what to do about it (see
  `BRAND_GUIDELINES.md`'s five-part empty-state anatomy). A screen
  with only "Nothing here." is never acceptable.
- **Progressive loading**: a full-page blocking overlay is used only
  for the initial auth/session check — never for an action that
  affects one region of the page (`UX_PRINCIPLES.md` rule 4). The rest
  of a page stays interactive while one widget loads.

**What is honestly not built yet, and should be treated as a real
gap when a future feature needs it, not assumed to already exist:**

- **Undo** as a first-class UI affordance (a toast with an "Undo"
  action after a destructive operation) does not exist anywhere in
  the product today. The current compensating control for anything
  that can't be truly undone is a Confirmation Dialog before the
  action (`UX_PRINCIPLES.md` rule 1) — real, but not the same thing as
  undo-after-the-fact. A future feature that would benefit from real
  undo should build it as a genuine, working affordance, never a UI
  element that implies reversibility that isn't real.
- **Background processing** (queued jobs, async long-running work)
  has no infrastructure yet — `VISION.md`'s Automation direction notes
  BullMQ is anticipated in the tech stack but not wired in, and
  `ARCHITECTURE_LOCK.md` §3 requires an ADR before introducing queues.
  Anything that today looks like "background processing" (lazy quote-
  expiry evaluation, best-effort asset-status sync) is synchronous,
  triggered on next access — not a real job queue.

---

## 6. One Click Rule

Always reduce unnecessary clicks. Every new feature should ask:

- Can this be completed faster?
- Can this be completed with fewer clicks?
- Can this be completed from the keyboard?

**Grounding, already real:** `UX_PRINCIPLES.md` rule 6 sets the hard
budget — booking a rental, creating a quote, finding a customer must
each be reachable in 3 or fewer interactions from the home screen, or
that's a navigation-architecture problem to fix, not a detail to
accept. The Dashboard's `QuickActions` widget and the header's
`QuickCreate` dropdown (both reading from one shared
`apps/web/src/lib/quick-actions.ts` list, so they can never drift out
of sync — see `UI_COMPONENT_INVENTORY.md`) exist specifically to put
every common "create X" action one click away from wherever the user
currently is. The `RentalWizard`/`QuoteWizard` exist because the two
highest-frequency actions deserve a guided flow with live pricing
feedback, not a raw CRUD form the user has to figure out
(`PRODUCT_PRINCIPLES.md`, "Fewer clicks for common workflows").

Before adding a new multi-step flow, check whether an existing
wizard, quick action, or command-palette entry can absorb it instead
of becoming a fourth click.

---

## 7. Simplicity Rule

Complexity is a cost, not a neutral choice: every extra button,
setting, field, dialog, workflow, or navigation level adds cognitive
load someone pays on every use, not once at build time. Prefer the
simpler of two designs whenever both solve the problem equally well —
in the schema, in the backend, and in the UI alike.

- **Complexity must be justified by a real, current requirement,
  never a hypothetical future one.** A field, an abstraction, or a
  configuration option added "in case we need it later" is a cost
  paid today for a benefit that may never arrive — see
  `ARCHITECTURE_LOCK.md` §1.1's own discipline of keeping `Asset` free
  of speculative columns.
- **Three similar things are better than one wrong abstraction.**
  Duplicating a small amount of logic across a few call sites is
  preferable to a shared abstraction that has to grow special cases
  for each of them — this is the same judgment `ARCHITECTURE_LOCK.md`
  §1.4's "no duplicated business logic" rule already makes for
  genuinely identical logic, and Section 17 (Plugin-First Principle)
  makes for genuinely optional capability; simplicity is what tells
  you which situation you're in.
- **A simpler interface beats a more powerful one a user won't
  discover.** See Section 11 (Discoverability) — power that requires
  documentation to find is not power a professional operator can rely
  on mid-workflow.

---

## 8. Productivity Philosophy

Havelio should gradually teach users. Users should become faster over
time, without ever being required to read documentation.

**What exists today** (built through Chapter 5 — see
`UI_REDESIGN_PLAN.md` Chapter 5 for the full design rationale):

- The **Command Palette** (`Cmd`/`Ctrl`+`K`, wired globally in
  `apps/app/layout.tsx`) never opens empty: an idle open composes
  Recent → Pinned → Quick Actions → Commands → Navigation; typing
  composes Quick Actions → Pinned → Commands → Navigation → live
  cross-entity search results, each permission-filtered.
  `apps/web/src/lib/command-types.ts`'s `CommandItem` now has real
  `"action"`, `"recent"`, `"pinned"`, and `"search-result"` kinds, all
  populated by working features, not unpopulated extension points.
- A `⌘K`/`Ctrl+K` **shortcut badge** sits in the sidebar's search
  trigger (platform-aware via `lib/platform.ts`), plus one real,
  dismissible **contextual hint** ("Press ⌘K to search or jump
  anywhere") shown until the user dismisses it once, per
  `use-dismissible-hint.ts` — this is the first real instance of
  Section 11's discoverability pattern, not a general coaching engine.
- A `Shift+?` **Shortcuts Help dialog** lists every registered
  keyboard shortcut, grouped and platform-aware.

**What this philosophy still needs, and is not yet built** — these
are real gaps to close through future chapters, not capabilities to
assume:

- **Progressive onboarding**: no first-run tour, checklist, or guided
  setup exists for a new tenant beyond the registration form itself.
- **Adaptive coaching** and **power-user mode**: no concept of a
  user's experience level exists in the product today; every user
  sees the identical UI regardless of tenure. The one dismissible hint
  built in Chapter 5 is a single, generic, reusable primitive
  (`DismissibleHint`) — not a multi-step coaching system, and Chapter
  5 deliberately did not build one (see Section 11, Discoverability).

When one of these is built, it must teach through usage (surfacing
the faster path at the moment the slower path is used), never through
a blocking tutorial or a document the user has to go read — see
Section 11 (Discoverability) and Section 22's anti-pattern against
blocking tutorials.

---

## 9. Power User Experience

The application should support: keyboard shortcuts, Command Palette,
Quick Actions, Global Search, Favorites, Recently Viewed, Pinned
Items, and rapid navigation. These features must remain extensible
for future AI workflows (Section 20).

**Built today:**

- **Command Palette** — `Cmd`/`Ctrl`+`K` (also `/`) opens the unified
  palette described in Section 8, with arrow-key/`Enter` navigation
  and a visible `Esc` hint. See
  `apps/web/src/components/shell/command-palette.tsx`.
- **Keyboard shortcut registry** — one single source of truth
  (`lib/keyboard-shortcuts.ts`, wired via
  `hooks/use-keyboard-shortcuts.ts`) covers `Cmd/Ctrl+K`, `/`, `N`
  (Quick Create), `Shift+?` (help), and `G` chords (`G C/R/A/D/Q`) for
  one-key navigation to Customers/Rentals/Assets/Documents/Quotes.
  Every shortcut is suppressed while focus is inside a text field.
  Adding a shortcut means adding one registry entry — no other file
  changes.
- **Quick Actions / Quick Create** — one shared, permission-filtered
  list of the product's create routes (`lib/quick-actions.ts`),
  surfaced as the header's `QuickCreate` dropdown, the Dashboard's
  `QuickActions` widget, and the palette's Quick Actions section.
- **Global Search** — five real, permission-aware providers
  (`lib/search-providers.ts`): Customers, Assets, Rentals, Quotes,
  Documents. Each calls the exact `search`-accepting endpoint its own
  list page already uses — debounced, multi-provider, one failing
  provider never breaks the others. Users and Invoices are
  deliberately **not** built as providers (no such pages/backend exist
  yet, per `VISION.md`'s "Planned, later phase"); a future provider
  implements the same `SearchProvider` interface, no palette changes
  needed.
- **Recently Viewed** — `lib/recent-items.ts` / `hooks/use-recent-items.ts`,
  `localStorage`-backed per user+tenant, tracks both page views and
  entity detail views (deduplicated, capped, most-recent-first).
- **Favorites and Pinned Items** — deliberately **one** generic store
  (`lib/pinned-items.ts` / `hooks/use-pinned-items.ts` /
  `components/shell/pin-button.tsx`), not two parallel systems, since
  both concepts are structurally identical (toggle a record on/off a
  list). Live on the 5 entity detail pages today (Customers, Assets,
  Rentals, Quotes, Documents).
- **Rapid navigation** — the collapsible Sidebar plus breadcrumbs give
  every page a consistent, always-visible path back to any other area
  (`UI_REDESIGN_PLAN.md` Chapter 1).

**Not yet built — real, named gaps for future chapters, not silent
omissions:**

- **Search providers for Users, Invoices, or a future global/AI
  provider** — no backend/page exists for the first two yet; the
  third is intentionally unbuilt (see Section 20).

A future search provider or productivity feature must extend the
existing `SearchProvider`/`CommandItem`/pinned-items shape rather than
invent a second, competing "quick access" surface — see Section 22's
rule against duplicate UI for parallel purposes.

---

## 10. Product Consistency

Every screen should answer, without the user having to ask:

- **Where am I?** — the Sidebar's active-state indicator plus
  breadcrumbs plus `PageHeader`'s title, consistently, on every page
  (`UI_REDESIGN_PLAN.md` Chapter 1).
- **What can I do?** — permission-gated actions are shown or omitted
  entirely, never shown disabled with no explanation
  (`UX_PRINCIPLES.md` rule 17, "enforced by omission, not by
  disabling").
- **What is the fastest action?** — the primary action on a page is
  always the visually dominant control (`PageHeader`'s
  `primaryAction`), never competing for attention with three
  equally-weighted buttons.
- **What should I do next?** — every empty state names a concrete
  next step (`UX_PRINCIPLES.md` rule 19); every list/detail page's
  next logical action (view all, edit, create) is one click away, not
  buried.

This section is the product-level restatement of `UX_PRINCIPLES.md`
rule 30: **consistency beats local optimization.** A screen-specific
"better" pattern that diverges from an established one elsewhere is
rejected by default — a genuinely better pattern gets added to
`UI_PATTERNS.md` and applied everywhere it's relevant, not shipped as
a one-off.

---

## 11. Discoverability

Users should naturally discover advanced functionality. No hidden
power features. Teach through usage, not documentation.

This is the standard every future onboarding/hint feature (Section 8)
must be held to: a feature is discoverable when a user doing the
normal, obvious thing eventually surfaces it (e.g. a keyboard-shortcut
badge appearing next to a button the user just clicked with the
mouse), not when a user has to already know to look for it in a help
menu, a changelog, or this documentation set. Havelio has zero
end-user-facing product documentation today by design — every
explanation belongs in the interface itself. If a feature genuinely
needs an explanation a well-designed interface can't give inline,
that's a signal the feature's design needs revisiting, not that a
help article should be written instead.

---

## 12. Timeline First

Every entity with meaningful lifecycle state exposes a timeline — a
single, chronological view merging its status history and audit
trail — reusing the one pattern already proven across the product,
never a bespoke per-module history view.

- **Already real:** Customers, Assets, Rentals, Quotes, and Documents
  each render a merged timeline of status changes and audit events
  (`.timeline()` service methods, `timeline.types.ts` per module,
  sharing one `TimelineEvent<TType>` envelope generic) through one
  shared, registry-driven `<Timeline>` frontend component — not five
  independently hand-rolled renderings of the same shape.
- **The rule:** a new entity with more than one lifecycle state
  (anything with a `status` column, in practice) gets a timeline built
  the same way, not a "recent activity" widget invented fresh for that
  one screen.
- **Why it matters beyond UX:** a timeline is also what makes an
  operator's "what happened and why" question answerable without
  engineering support — the same audit data Section 15 (Event-Driven
  Thinking) treats as the seam for a future event system is what a
  timeline already renders for a human today.
- **A timeline is business history, not an audit log.** It renders
  what happened in terms an operator thinks in — "Rental started,"
  "Invoice paid," "Damage reported" — never a raw technical trail.
  `AuditService.log()` (Section 15) is the data source; the timeline
  is the human-facing product surface built on it, not a UI wrapper
  around the log table itself.
- **Every timeline page opens with an Entity Summary** — a small set
  of real, aggregated numbers (a customer's total rentals and revenue,
  an asset's revenue generated) rendered above the timeline, using one
  reusable summary-card pattern regardless of entity. Like the
  timeline itself, Entity Summary is a shared pattern a new entity
  reuses, never a bespoke stats block invented per screen — and a
  field with no real underlying data is omitted, never approximated
  (Section 7, Simplicity Rule).

---

## 13. Communication First

Every user-facing state change is something Havelio can communicate,
not just something it recorded.

- **Already real:** the Customer Portal's message center and in-app
  notifications (`CustomerNotification`, `PortalNotificationsService`)
  give a customer a real channel for rental-related updates; every
  notification, toast, and portal message shares one tone and one
  event vocabulary (`UX_PRINCIPLES.md` rule 16), so "rental extended"
  reads the same whether it's a staff toast (Section 5, Zero Friction)
  or a customer notification.
- **Planned, not yet built:** email, Telegram, WhatsApp, and push
  notification channels (`ROADMAP.md` TASK-0015) are new
  implementations behind the existing provider-seam pattern
  (`ARCHITECTURE_LOCK.md` §1.15) — the same discipline
  `EmailProvider`/`StorageAdapter` already follow — never a one-off
  integration bolted onto a single feature.
- **The rule:** before shipping a feature with a meaningful state
  change (a quote accepted, a rental extended, a document signed),
  ask whether the person affected would want to know — and if so,
  route it through the existing notification/audit vocabulary, not a
  new, parallel "send a message" mechanism.

---

# Part C — Platform Architecture

## 14. API First

The REST API is the product, not an implementation detail behind the
web client. The web app and the Customer Portal are the API's first
two consumers, not privileged ones.

- **Already real:** the web app has zero server-side-only logic —
  every endpoint documented in `api.md` is everything the web client
  itself uses (`PRODUCT_PRINCIPLES.md`, "API-first extensibility"). No
  capability exists that's reachable only from inside a server
  component or a hidden internal route.
- **The rule:** a new feature is designed API-first — the endpoint,
  its shape, its permission gate — before the screen that calls it.
  If a capability can only be triggered by a specific frontend code
  path with no equivalent request a script or a future client could
  make, that's a gap to close, not a shortcut to ship.
- **What this unlocks, deliberately:** a future mobile client
  (`ROADMAP.md` TASK-0014), a versioned public API (TASK-0018), and an
  AI agent (Section 20) all become new consumers of the surface that
  already exists, not new backend surface area to build.

---

## 15. Event-Driven Thinking

No event bus, domain-event model, or pub/sub architecture exists in
this codebase yet — introducing one requires an ADR before
implementation (`ARCHITECTURE_LOCK.md` Part 3). This section is not a
claim that one does; it's how to design so that adding one later is a
renaming exercise, not a redesign.

- **Already real, and the seam a future event system attaches to:**
  every commercially or operationally significant action already
  calls `AuditService.log()` using a `"<entity>.<verb>"` action-name
  convention (D-010) — `quote.accepted`, `rental.started`,
  `document.signed`. This is already the vocabulary of things that
  happened, not merely database writes.
- **The rule:** name a new action the way an event would be named,
  even though today it only writes an audit row. A handler internally
  called `updateStatus()` is fine; the audit action string it logs
  should read like something that happened, not a bare CRUD verb.
- **Why now, not later:** the day a real event system is introduced,
  the audit-log call sites are exactly where its triggers get
  attached — that's only cheap if the naming discipline was already
  in place before that day arrives.

---

## 16. Platform Extensibility

New capability is added by implementing an existing seam, never by
forking or bypassing one.

- **Already real:** `StorageAdapter`, `EmailProvider`, and
  `DocumentSignatureProvider` are swappable interfaces with one real
  implementation each today and a named future one waiting behind the
  same contract (`ARCHITECTURE_LOCK.md` §1.15); a new `DocumentType`,
  a new `SearchProvider` (Section 9), or a new `MonthlyBillingStrategy`
  value extends an existing universal model rather than starting a
  parallel one (`ARCHITECTURE_LOCK.md` Part 2).
- **The rule:** extension means a new implementation behind an
  existing interface, or new tenant configuration within an existing
  universal model — never a special case reaching around the seam to
  a vendor SDK, a database table, or a computed value directly
  (`ARCHITECTURE_LOCK.md` §4's forbidden-shortcuts list makes the
  "never" version of this rule explicit).
- **Distinct from Section 17:** this section is about _whether_ the
  codebase can be extended (it can, and how); Section 17 is the
  decision rule for _when_ a new feature should be built as an
  extension rather than core logic.

---

## 17. Plugin-First Principle

Havelio has no plugin runtime yet — `ROADMAP.md` TASK-0019 (Platform
Extensions: plugins, marketplaces, partner ecosystem) is a future,
unscoped direction, not shipped work. This principle governs how
today's decisions build toward that future, not a claim that plugins
exist.

- **The test:** when a new capability is genuinely optional,
  tenant-specific, or industry-specific — not something every tenant
  needs — ask whether it could be built as a new implementation
  behind an existing seam (Section 16) rather than a conditional
  branch inside core logic. If yes, build it that way now, even with
  no plugin runtime to install it into later.
- **What this looks like today, without a plugin system:** a new
  `DocumentType` or `SearchProvider` is already, functionally, a
  plugin — a self-contained unit registered into an existing
  extension point, not a change scattered across the codebase.
- **The boundary:** this is a bias, not a mandate — see Section 7
  (Simplicity Rule)'s companion warning against speculative
  abstraction. A capability every tenant needs belongs in core, built
  simply; a capability some tenants need belongs behind a seam.

---

## 18. Marketplace Readiness

`ROADMAP.md` TASK-0019 names a template marketplace, an integration
marketplace, and a partner ecosystem as a future direction — not
committed, scoped work. What today's decisions should protect is the
precondition for that future to be possible without a rewrite.

- **The rule:** every extension point (a document template, a search
  provider, an industry-configuration pack, a storage/email/signature
  provider) must already be a self-contained, named, independently
  describable unit — not logic scattered across files that happens to
  combine into "the thing a tenant enabled." If a future extension
  can't be described in one sentence and located in one place, it
  isn't marketplace-ready, regardless of whether a marketplace exists
  yet.
- **Already real:** `DEFAULT_TEMPLATES`, the `SearchProvider` registry
  (Section 9), and the provider interfaces in Section 16 are each
  already a flat, enumerable list — the actual shape a "browse and
  enable" marketplace UI would read from, whenever one is built.

---

## 19. Product Ecosystem

Every current and future participant in Havelio — the staff web app,
the Customer Portal, a future mobile client, a future public API
consumer, a future AI agent — experiences the same product, not a
fragmented set of siblings that happen to share a database.

- **Already real:** the staff app and Customer Portal are two clients
  of one backend, cryptographically isolated from each other for
  trust (D-033) but built on the identical permission model, audit
  trail, and universal data model — a portal action and a staff action
  are indistinguishable in the audit log except for who performed
  them.
- **The rule:** a future mobile client (`ROADMAP.md` TASK-0014),
  public API consumer (TASK-0018), or AI agent (Section 20) joins this
  ecosystem as another participant, not a special case — it sees the
  same data shapes, obeys the same permissions, and produces the same
  audit trail a human clicking a button would. A feature that only
  works correctly from one surface, or that a second surface would
  have to reimplement rather than reuse, is an ecosystem gap to close
  before it ships anywhere.

---

## 20. AI-Ready Architecture

Every reusable productivity component must expose extension points a
future AI assistant can invoke — Command Palette, Quick Actions,
Search Providers, Create dialogs, navigation — **without rewriting UI
architecture**. This is a direct consequence of `VISION.md`'s
AI-first long-term vision and `PRODUCT_PRINCIPLES.md`'s "AI performs
workflows, not only conversation" principle: the day an AI agent needs
to open the Command Palette, trigger a Quick Action, or navigate to a
specific page on the operator's behalf, it should be able to call the
same typed interface a human interaction already calls — not a
parallel, AI-specific code path.

**Where the seams already exist:**

- `CommandItem`/`CommandKind` (`lib/command-types.ts`) is a typed,
  serializable command shape: every `"navigate"`/`"recent"`/`"pinned"`/
  `"search-result"` kind carries a plain `href`, and every `"action"`
  kind carries a plain `run: () => void` closure — a future AI agent
  invokes either identically to a human `Enter` keypress, no DOM
  interaction required. Two real `"action"` commands (toggle dark
  mode, log out) already exercise this, not just an untested type.
- `SearchProvider` (`lib/search-providers.ts`) is the same interface a
  future `AiSearchProvider` would implement — `search(query, tenantId)`
  returning `SearchResult[]` — so an AI agent calls the identical
  method the Command Palette already calls, no separate AI-only search
  path.
- `QuickActionDefinition` (`lib/quick-actions.ts`) is a plain,
  declarative list (`id`, `href`, `labelKey`, `icon`, `permission`) —
  trivially inspectable and invokable by anything that can read an
  array and call `router.push`, not something requiring UI-layer
  reverse-engineering.
- Every mutating action in the product is already reachable through a
  permission-gated REST endpoint (Section 14, API First) — a future AI
  agent acting through the API, not the DOM, is the intended
  integration shape.

**What this requires of every future productivity feature:** before
building a new UI-only interaction pattern (a custom dropdown, a
bespoke modal flow, a page-specific keyboard shortcut with no
programmatic equivalent), ask whether it can instead be expressed as
a new `CommandItem` kind, a new `QuickActionDefinition` entry, or a
new REST endpoint an agent could call identically to a human. If a
capability can only be triggered by a mouse click on one specific
component with no underlying callable seam, it is not AI-ready, and
that is a defect to fix before shipping, not an acceptable trade-off.

**The rules for when AI actually acts** (`ROADMAP.md` TASK-0020, a
future direction — not yet built):

- **Explain-before-execute** — a proposed action is shown before it
  runs.
- **Permission-aware** — an AI-initiated action is gated by the acting
  user's real permissions, exactly like Section 19 (Product Ecosystem)
  requires of every participant, never a bypass.
- **Fully audited**, via the existing `AuditService`, the same as any
  human action.
- **Human approval required** for high-impact operations.
- **No autonomous destructive actions** — a hard rule, not a
  configurable default (`ARCHITECTURE_LOCK.md` Part 4).

---

## 21. Long-Term Compatibility

A decision made today must not become a broken promise tomorrow — for
a tenant's data, a partner's integration, or a plugin built against
today's seams.

- **Already real:** `ARCHITECTURE_LOCK.md` §1.13 forbids breaking
  existing API response shapes, stored snapshots, document versions,
  share links, or completed workflows without an explicit migration
  plan; `ROADMAP.md` TASK-0018's public API versioning is described as
  additive on top of the existing REST surface, never a replacement
  of it.
- **The rule, extended to the platform concepts in Part C:** a future
  plugin, marketplace listing, or public API integration built
  against a documented seam must keep working after a Havelio
  upgrade, unless a documented, versioned, migration-planned breaking
  change is announced — the same discipline already applied to the
  REST API, extended to every future extension point.
- **Distinct from Section 26 (Ten-Year Rule):** this section protects
  commitments already made — don't break the past. Section 26 governs
  commitments being made right now — don't paint the future into a
  corner.

---

# Part D — Deciding and Shipping

## 22. Anti-Patterns

Never:

- **Create duplicate UI** — one shared component per pattern
  (`DataTable`, the `dashboard/` system, `@rentos/ui` primitives),
  never a second hand-rolled version of something that already has a
  canonical implementation. This is the same discipline
  `ARCHITECTURE_LOCK.md` §1.4 requires for backend business logic,
  applied to the frontend.
- **Build speculative platform infrastructure** — a plugin runtime, an
  AI-agent execution system, or marketplace tooling built before a
  real, concrete requirement exists. Platform Extensibility (Section
  16), Plugin-First (Section 17), Marketplace Readiness (Section 18),
  and AI-Ready Architecture (Section 20) are long-term directions that
  shape today's seams and interfaces — they are not license to build
  the infrastructure itself early. Extend an existing seam when a real
  need arrives; don't build a seam's imagined future consumer today
  (see Section 7, Simplicity Rule, and Section 26, Ten-Year Rule).
- **Add unnecessary clicks** — see Section 6.
- **Hide important actions** — a control the user has permission to
  use is shown where they'd look for it, not buried behind an extra
  menu "for safety" (`UX_PRINCIPLES.md` rule 2).
- **Use inconsistent spacing** — every spacing value traces back to
  `BRAND_GUIDELINES.md`'s spacing scale; no hardcoded pixel gaps.
- **Invent colors** — every color used anywhere traces back to
  `BRAND_GUIDELINES.md`'s color system and its CSS custom properties
  in `packages/ui/src/styles/theme.css`. A screen that needs a color
  not already in that system updates `BRAND_GUIDELINES.md` first.
- **Invent typography** — Inter (UI) and JetBrains Mono (numeric/code)
  only, per `BRAND_GUIDELINES.md`'s Typography section.
- **Mix icon styles** — `lucide-react` only, per `BRAND_GUIDELINES.md`'s
  Icon style section; no second icon library, no emoji-as-icon.
- **Create different UX for similar workflows** — every list page
  behaves identically (`UX_PRINCIPLES.md` rule 10); every wizard
  shares the same step-index/validation architecture
  (`PRODUCT_PRINCIPLES.md`, "Consistent design system").
- **Use blocking tutorials** — see Section 11: teaching happens
  through the interface itself, never a modal the user must click
  through before they can use the product.
- **Create visual noise** — no decorative animation, no unexplained
  icon-only controls, no gradient used for decoration rather than a
  deliberate, sparing accent (`BRAND_GUIDELINES.md`'s Brand rules
  section has the full, enforceable list this bullet summarizes).

---

## 23. Customer Value Rule

If you can't name the specific rental-business workflow a feature
makes faster, safer, or clearer for a real operator, it doesn't ship.

- **The test:** name the operator (owner, manager, technician,
  accountant) and the moment in their day this changes. "It would be
  useful" is not a name; "a manager checking asset availability before
  quoting a customer on the phone" is.
- **Not a feature-parity checklist.** A competitor having a feature is
  not, by itself, a reason to build it — the test above applies
  identically whether an idea originated from a competitor's
  changelog, a support ticket, or an internal brainstorm.
- **This is the first, sharpest filter** — see Section 24 (Decision
  Filter) for how it fits alongside the Universal Rental Philosophy
  (Section 3) and Simplicity Rule (Section 7) as the fast pre-check
  every idea passes through before design work begins.

---

## 24. Decision Filter

Before spending design or implementation time on an idea, run it
through three fast questions — a pre-check, not a substitute for
Section 25's detailed framework.

1. **Customer Value** (Section 23) — can you name the operator and the
   workflow this helps?
2. **Universal Rental Philosophy** (Section 3) — does it hold for any
   rental vertical, or is it accidentally industry-specific?
3. **Simplicity** (Section 7) — is this the simplest way to solve the
   actual problem, not just the most impressive one?

Any "no" means stop and reconsider before design work continues — not
abandon the idea outright, the same latitude Section 25 already grants
its own questions. Once an idea clears this filter, it proceeds to
Section 25 (Product Decision Framework) for the detailed feel/UX check
before implementation.

---

## 25. Product Decision Framework

Once a feature clears Section 24's fast filter, ask the following
seven questions before implementing it:

1. Does it reduce friction? (Section 5)
2. Does it reduce clicks? (Section 6)
3. Does it improve discoverability? (Section 11)
4. Does it improve consistency? (Section 10, Section 22)
5. Does it support keyboard users? (Section 9)
6. Does it improve accessibility? (Section 27)
7. Does it align with Product Philosophy? (Section 4)

**If not, the feature requires refinement** — not abandonment, and
not silent implementation anyway. Where a feature genuinely can't
satisfy one of these questions (e.g. a keyboard shortcut is
meaningless for a photo-upload drag target), that's a legitimate,
documented exception, not a failure — but it must be a deliberate
call made explicitly, the same way `VISION.md` and
`UI_REDESIGN_PLAN.md` document deliberate scope boundaries elsewhere
in this repository, never an unexamined default.

This framework is the practical, detailed gate every future task runs
a proposed feature through after Section 24's fast filter and before
consulting `ARCHITECTURE_LOCK.md` for how to build it correctly.
Passing this framework answers "should we build this, and roughly what
should it feel like." `ARCHITECTURE_LOCK.md`, `UI_PATTERNS.md`,
`UX_PRINCIPLES.md`, and `BRAND_GUIDELINES.md` then answer "exactly how
do we build it correctly."

---

## 26. Ten-Year Rule

Before committing to an architecture decision, ask whether it will
still make sense in ten years — after plugins, a marketplace, a public
API, AI agents, and rental verticals nobody has thought of yet have
been built on top of it.

- **Already real:** the decisions `ARCHITECTURE_LOCK.md` Part 3
  requires an ADR to change — the multi-tenancy model, the
  money-storage convention, the atomic-numbering architecture, the
  auth-boundary isolation — were each made with exactly this horizon
  in mind, not the shipping deadline in front of them at the time.
- **The rule:** a decision that only works for today's feature set,
  and would need an ADR-sized reversal to support a plugin, a public
  API consumer, or a new vertical, is a decision to reconsider now —
  not a cost to accept and pay later. This does not mean building
  speculative infrastructure today (see Section 7, Simplicity Rule);
  it means not choosing the option that's simple today only because it
  quietly assumes tomorrow won't happen.

---

## 27. Product Quality Checklist

A feature is not complete until:

- Business logic verified (real tests, not just "the build succeeds"
  — `ARCHITECTURE_LOCK.md` §1.16).
- UI consistent (checked against `UI_PATTERNS.md`/`BRAND_GUIDELINES.md`,
  not just "looks fine in isolation").
- Accessible (keyboard reachable, labeled, focus-visible — per
  `UX_PRINCIPLES.md` and `UI_PATTERNS.md`'s per-component keyboard
  notes).
- Responsive (verified at real breakpoints, not assumed from desktop).
- Localized (all 14 shipped languages, key-parity verified —
  `ARCHITECTURE_LOCK.md` §1.14).
- Dark mode verified (not just "the tokens should work").
- **Universal** — checked against Section 3's test (would this still
  make sense for a different rental vertical), not just the one
  industry it happened to be designed against.
- Documentation updated in the same task, not a follow-up
  (`ARCHITECTURE_LOCK.md` §1.18).
- Docker verified (a real container rebuild, not "should work").
- Browser verified (a real walkthrough with real data, not a
  fabricated claim — `ARCHITECTURE_LOCK.md` §4 explicitly forbids
  claiming this was done when it wasn't).
- Tests green.
- CI green — "should pass" is not the same statement as "is green,"
  and only the latter closes a task (`ARCHITECTURE_LOCK.md` §1.17).

This list is the product-philosophy framing of the exact checklist
`ARCHITECTURE_LOCK.md` §1.17 and §5 already enforce technically — see
those sections for the authoritative, detailed version (commands to
run, exact commit/push/CI sequence). This section exists so the
_reason_ for that checklist — a feature that skips any line of it is
not actually finished, regardless of how complete it looks — is
stated at the product level, not only the process level.

---

# Part E — Global Readiness

## 28. Global By Design

Section 3's Universal Rental Philosophy asks whether a feature holds
for any rental vertical. This section asks the companion question:
does it hold for any country, language, currency, or timezone? Both
are the same underlying commitment — **One Platform. Every Asset.**
(Section 1) — read against a second axis. A feature that only makes
sense for one industry is not universal; a feature that only makes
sense for one country is not global. Neither ships as core logic.

**The permanent principle:** no feature may assume one language, one
country, one currency, one timezone, one date/number format, one
address format, one tax-identifier format, one document language, one
name format, or one measurement convention. This is a durable
architectural constraint, evaluated the same way Section 3's
three-industry test is — before adding a schema column, a hardcoded
list, or a business-logic branch, ask whether it would break for a
tenant operating in a different country, a customer in a different
country, or an interface language different from either.

**Language, country, currency, and timezone are four separate
settings — never conflated:**

- **UI language** (`i18n.language`) is a per-user display preference.
- **Company/tenant country** and **customer country** are business
  facts, independent of UI language and of each other.
- **Currency** is set per transaction/tenant (an ISO 4217 code) and
  must never be inferred from UI language or country — `formatMoney()`
  (`apps/web/src/lib/money.ts`) already takes a currency code as an
  explicit parameter, never derives one.
- **Document language** (`DECISIONS.md` D-062 records its exact
  current state) is conceptually independent of UI language — a staff
  member working in Ukrainian can generate a German-language contract
  for a German customer. Implemented via nullable
  `DocumentTemplate.language` plus per-`(tenant, documentType,
language)` active-template uniqueness: a tenant maintains one
  template per language it needs, and the "Generate document" flow
  shows a language picker only when 2+ active templates exist for that
  document type. This is deliberately not automatic translation —
  each language's template prose is authored (or edited via the
  no-code builder) by the tenant.
- **Timezone** distinguishes the user's browser timezone from the
  tenant's business timezone from a stored UTC timestamp — the
  existing UTC-storage discipline (`ARCHITECTURE_LOCK.md` §1.8) is
  the seam this depends on; a user-facing timezone _display_
  preference is a legitimate, honest future gap, not something to
  fabricate.

**What this looks like, concretely:** never write `country === "PL"
→ language = "pl"` or `language === "de" → currency = "EUR"`
anywhere in the codebase. A Polish rental company may run the staff
UI in Ukrainian, rent to a German customer, generate that customer's
contract in German, and invoice in EUR — every one of those four
facts is independently selected, never inferred from another.

**Locale metadata lives in one place:** every supported UI language is
declared once, in `packages/localization/src/index.ts`'s locale
registry (code, display name, native name, BCP-47 tag, text
direction) — never duplicated as a second hardcoded list inside a
component. A language selector, a settings page, or a parity check
all read the same registry; adding a future language is registering
one entry and its translation file, not hunting for every place a
language list was copy-pasted.

**What this does not require:** multi-currency accounting, exchange
rates, a tax-compliance engine, country-specific legal-document
generation, automatic translation, or a full RTL redesign. Global by
Design is about not hardcoding an assumption that breaks for a
different country or language — it is not a mandate to build every
piece of infrastructure a truly global business might eventually need
before a real requirement exists (Section 7, Simplicity Rule; Section
22's anti-pattern against speculative platform infrastructure applies
here exactly as it does to plugins and marketplaces). A genuine
country- or jurisdiction-specific gap (a tax-ID format Havelio doesn't
validate yet, a currency Havelio doesn't format correctly) is
documented as a known limitation, never silently ignored and never
faked with a hardcoded assumption that happens to work for one
country.
