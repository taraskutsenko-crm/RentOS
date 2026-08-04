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

## Later chapters (named, not detailed — scoped when reached)

- **Chapter 2 — List & Detail Page Patterns:** extract `Table`,
  `InfoRow`, `Timeline`, pagination into shared components; apply
  `PageHeader` everywhere.
- **Chapter 3 — Forms & Wizards:** reconcile `RentalWizard`/
  `QuoteWizard` against `UI_PATTERNS.md`'s Wizard/Stepper/Forms specs.
- **Chapter 4 — Dashboard:** a real staff dashboard (stat cards,
  recent activity), reusing the Customer Portal dashboard's proven
  shape.
- **Chapter 5 — Settings & Account:** profile/account pages, the
  language-switcher's live wiring, notification preferences once a
  backend exists.

Each future chapter follows the same process this one does: read the
implementation, audit against the four governing docs, write a Design
Rationale, implement, verify, document, commit.
