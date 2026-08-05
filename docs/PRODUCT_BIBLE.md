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

---

## 1. Product Vision

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
vision" and Section 7 of this document.

---

## 2. Product Philosophy

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

## 3. Zero Friction Principle

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

## 4. One Click Rule

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

## 5. Productivity Philosophy

Havelio should gradually teach users. Users should become faster over
time, without ever being required to read documentation.

**What exists today**, as the seams this philosophy will build on:

- The **Command Palette** (`Cmd`/`Ctrl`+`K`, wired globally in
  `apps/app/layout.tsx`) is real and navigates to any permitted page
  by typed search — the honest current shape is `kind: "navigate"`
  only; `apps/web/src/lib/command-types.ts` already types `"action"`,
  `"search-result"`, and `"recent-page"` kinds as unpopulated
  extension points, not implemented features (see Section 6).

**What this philosophy still needs, and is not yet built** — these
are real gaps to close through future chapters, not capabilities to
assume:

- **Discoverability**: no in-product hint system, tooltip coaching, or
  "did you know" surface exists anywhere yet.
- **Progressive onboarding**: no first-run tour, checklist, or guided
  setup exists for a new tenant beyond the registration form itself.
- **Contextual hints**: no inline suggestion ("you could do this
  faster with Cmd+K") exists on any screen.
- **Shortcut badges**: no UI surfaces a keyboard shortcut next to the
  mouse action it replaces (e.g. a `⌘K` badge next to a search box)
  outside the Command Palette's own `Esc` hint.
- **Command Palette education**: nothing currently teaches a new user
  that the palette exists, beyond it being reachable via the header's
  search button.
- **Adaptive coaching** and **power-user mode**: no concept of a
  user's experience level exists in the product today; every user
  sees the identical UI regardless of tenure.

When one of these is built, it must teach through usage (surfacing
the faster path at the moment the slower path is used), never through
a blocking tutorial or a document the user has to go read — see
Section 9 (Discoverability) and Section 10's anti-pattern against
blocking tutorials.

---

## 6. Power User Experience

The application should support: keyboard shortcuts, Command Palette,
Quick Actions, Global Search, Favorites, Recently Viewed, Pinned
Items, and rapid navigation. These features must remain extensible
for future AI workflows (Section 7).

**Built today:**

- **Command Palette** — `Cmd`/`Ctrl`+`K` opens a searchable list of
  every page the current user has permission to reach, with
  arrow-key/`Enter` navigation and a visible `Esc` hint. See
  `apps/web/src/components/shell/command-palette.tsx`.
- **Quick Actions / Quick Create** — one shared, permission-filtered
  list of the product's create routes (`lib/quick-actions.ts`),
  surfaced both as the header's `QuickCreate` dropdown and the
  Dashboard's `QuickActions` widget.
- **Global Search (foundation only)** — the Command Palette's search
  input today filters navigable pages by name; it is explicitly
  documented (in the component's own header comment) as the seam for
  real cross-entity search (customers, rentals, assets, quotes,
  documents) once that's wired to a real API — not yet implemented,
  and not to be assumed implemented by a future feature that reads
  "the search bar" and expects entity results back.
- **Rapid navigation** — the collapsible Sidebar plus breadcrumbs give
  every page a consistent, always-visible path back to any other area
  (`UI_REDESIGN_PLAN.md` Chapter 1).

**Not yet built — real, named gaps for future chapters, not silent
omissions:**

- **Favorites** — no mechanism exists to mark any record as a
  favorite anywhere in the product.
- **Recently Viewed** — `command-types.ts` types a `"recent-page"`
  `CommandKind` for exactly this, but nothing populates it today; no
  view-history is tracked client- or server-side.
- **Pinned Items** — no pinning concept exists on any list or detail
  page.

A future implementation of any of these three must extend the
existing Command Palette/`CommandItem` shape rather than invent a
second, competing "quick access" surface — see Section 10's rule
against duplicate UI for parallel purposes.

---

## 7. AI Readiness

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
  serializable command shape already designed to add `"action"` and
  `"search-result"` kinds without reshaping the palette component
  itself.
- `QuickActionDefinition` (`lib/quick-actions.ts`) is a plain,
  declarative list (`id`, `href`, `labelKey`, `icon`, `permission`) —
  trivially inspectable and invokable by anything that can read an
  array and call `router.push`, not something requiring UI-layer
  reverse-engineering.
- Every mutating action in the product is already reachable through a
  permission-gated REST endpoint (`ARCHITECTURE_LOCK.md`'s
  "API-first extensibility" principle, §1.3) — a future AI agent
  acting through the API, not the DOM, is the intended integration
  shape, consistent with `ARCHITECTURE_LOCK.md` §2's explicit
  extensible-area note: "AI-assisted workflows that read/propose, with
  human approval for anything that writes or transitions state."

**What this requires of every future productivity feature:** before
building a new UI-only interaction pattern (a custom dropdown, a
bespoke modal flow, a page-specific keyboard shortcut with no
programmatic equivalent), ask whether it can instead be expressed as
a new `CommandItem` kind, a new `QuickActionDefinition` entry, or a
new REST endpoint an agent could call identically to a human. If a
capability can only be triggered by a mouse click on one specific
component with no underlying callable seam, it is not AI-ready, and
that is a defect to fix before shipping, not an acceptable trade-off.

---

## 8. Product Consistency

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

## 9. Discoverability

Users should naturally discover advanced functionality. No hidden
power features. Teach through usage, not documentation.

This is the standard every future onboarding/hint feature (Section 5)
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

## 10. Anti-Patterns

Never:

- **Create duplicate UI** — one shared component per pattern
  (`DataTable`, the `dashboard/` system, `@rentos/ui` primitives),
  never a second hand-rolled version of something that already has a
  canonical implementation. This is the same discipline
  `ARCHITECTURE_LOCK.md` §1.4 requires for backend business logic,
  applied to the frontend.
- **Add unnecessary clicks** — see Section 4.
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
- **Use blocking tutorials** — see Section 9: teaching happens through
  the interface itself, never a modal the user must click through
  before they can use the product.
- **Create visual noise** — no decorative animation, no unexplained
  icon-only controls, no gradient used for decoration rather than a
  deliberate, sparing accent (`BRAND_GUIDELINES.md`'s Brand rules
  section has the full, enforceable list this bullet summarizes).

---

## 11. Definition of Done

A feature is not complete until:

- Business logic verified (real tests, not just "the build succeeds"
  — `ARCHITECTURE_LOCK.md` §1.16).
- UI consistent (checked against `UI_PATTERNS.md`/`BRAND_GUIDELINES.md`,
  not just "looks fine in isolation").
- Accessible (keyboard reachable, labeled, focus-visible — per
  `UX_PRINCIPLES.md` and `UI_PATTERNS.md`'s per-component keyboard
  notes).
- Responsive (verified at real breakpoints, not assumed from desktop).
- Localized (all six shipped languages, key-parity verified —
  `ARCHITECTURE_LOCK.md` §1.14).
- Dark mode verified (not just "the tokens should work").
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

## 12. Product Decision Framework

Before implementing any feature, ask:

1. Does it reduce friction? (Section 3)
2. Does it reduce clicks? (Section 4)
3. Does it improve discoverability? (Section 9)
4. Does it improve consistency? (Section 8, Section 10)
5. Does it support keyboard users? (Section 6)
6. Does it improve accessibility? (Section 11)
7. Does it align with Product Philosophy? (Section 2)

**If not, the feature requires refinement** — not abandonment, and
not silent implementation anyway. Where a feature genuinely can't
satisfy one of these questions (e.g. a keyboard shortcut is
meaningless for a photo-upload drag target), that's a legitimate,
documented exception, not a failure — but it must be a deliberate
call made explicitly, the same way `VISION.md` and
`UI_REDESIGN_PLAN.md` document deliberate scope boundaries elsewhere
in this repository, never an unexamined default.

This framework is the practical, seven-question gate every future
task should run a proposed feature through **before** consulting
`ARCHITECTURE_LOCK.md` for how to build it correctly. Passing this
framework answers "should we build this, and roughly what should it
feel like." `ARCHITECTURE_LOCK.md`, `UI_PATTERNS.md`,
`UX_PRINCIPLES.md`, and `BRAND_GUIDELINES.md` then answer "exactly how
do we build it correctly."
