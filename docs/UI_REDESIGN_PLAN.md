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

## Later chapters (named, not detailed — scoped when reached)

- **Chapter 3 — List & Detail Page Patterns:** extract `Table`,
  `InfoRow`, `Timeline`, pagination into shared components; apply
  `PageHeader` everywhere.
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
