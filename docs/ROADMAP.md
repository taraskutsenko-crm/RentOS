# RentOS Roadmap

Status legend: **COMPLETED** · **IN PROGRESS** · **NEXT** · **PLANNED** ·
**FUTURE** · **TECHNICAL DEBT**

Dates below are commit-history-derived where available; where the
repository doesn't record a completion date, none is invented.

> Before starting any task on this roadmap, read
> [`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md) — it defines which
> parts of the architecture below are locked, which are extensible,
> which require a new ADR before implementation, and the verification
> contract every task must satisfy before it's considered done.

## Completed

| Module                                                                                                          | Status    | Notes                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production infrastructure, monorepo, CI                                                                         | COMPLETED | Turborepo + pnpm workspaces, Docker Compose, GitHub Actions.                                                                                                                                                                                                                                                |
| Authentication & tenant onboarding                                                                              | COMPLETED | Commit `c370234`. See [ADR 0001](adr/0001-authentication-and-tenant-context.md).                                                                                                                                                                                                                            |
| Multitenancy (`TenantGuard`, membership verification)                                                           | COMPLETED | Part of the same ADR 0001 work.                                                                                                                                                                                                                                                                             |
| RBAC / granular permissions (`PermissionsGuard`)                                                                | COMPLETED | Extended with every subsequent module (Assets, Rentals, Quotes, rental billing settings).                                                                                                                                                                                                                   |
| Audit logging infrastructure                                                                                    | COMPLETED | `AuditService`, used by every mutating action across all modules.                                                                                                                                                                                                                                           |
| Customers module                                                                                                | COMPLETED | Commit `0f9c1f8`. Full CRUD, search, soft delete.                                                                                                                                                                                                                                                           |
| Universal Assets module                                                                                         | COMPLETED | Commit `a50f3be`. Categories, tenant-configurable statuses, custom fields, images/documents, timeline. See [ADR 0002](adr/0002-universal-asset-model.md)–[ADR 0005](adr/0005-asset-file-storage-strategy.md).                                                                                               |
| Rentals module (TASK-0006): lifecycle, availability engine, base pricing                                        | COMPLETED | Commit `aa77fa9`. See [ADR 0006](adr/0006-rental-lifecycle-and-availability.md).                                                                                                                                                                                                                            |
| MONTHLY billing fix: real calendar-month arithmetic (not flat 30 days)                                          | COMPLETED | Commit `bb0cbf1`, ahead of TASK-0007.                                                                                                                                                                                                                                                                       |
| Quotes and Commercial Offers module (TASK-0007)                                                                 | COMPLETED | Commit `934cdeb`. Quote wizard, universal line items, PDF generation, email abstraction, public token-based acceptance, quote-to-rental conversion, duplication. See [ADR 0007](adr/0007-quotes-and-commercial-offers.md).                                                                                  |
| Configurable monthly billing strategies — Rentals                                                               | COMPLETED | Commit `744aec8`. `CALENDAR_MONTH` (default) / `FIXED_30_DAYS` / `CUSTOM`, tenant-scoped settings, per-item historical snapshot. See [ADR 0008](adr/0008-configurable-monthly-billing-strategies.md).                                                                                                       |
| Document Management Platform — Part 1 (Architecture & Domain Model, TASK-0008)                                  | COMPLETED | Generic `Document`/`DocumentVersion`/`DocumentFile`/`DocumentItem` model, immutable versioning, per-type atomic numbering, granular permissions. See [ADR 0010](adr/0010-document-management-platform.md).                                                                                                  |
| Document Management Platform — Part 2 (Rendering, Templates, Sharing, Email, E-Signature Foundation, TASK-0008) | COMPLETED | Versioned HTML/CSS templates, universal variable resolution, Puppeteer-based HTML/PDF rendering, password-optional public share links, retryable email delivery, swappable `DocumentSignatureProvider` (mock only), full frontend UI. See [ADR 0011](adr/0011-document-rendering-and-sharing.md).           |
| Customer Portal + Havelio rebrand (TASK-0009)                                                                   | COMPLETED | Fully separate customer auth stack, dashboard, rentals + calendar, documents (preview/download/sign/ZIP), extension requests, damage reports, messages, notifications, equipment/QR lookup, staff-side management panel. Visible branding now reads "Havelio." See [ADR 0012](adr/0012-customer-portal.md). |

## Pre-TASK-0008 stabilization (completed)

| Item                                                                                                                                        | Status    |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Core project documentation (this file and its siblings)                                                                                     | COMPLETED |
| Quote monthly-pricing consistency (share the Rentals pricing engine, tenant billing settings, and historical snapshot behavior with Quotes) | COMPLETED |
| Race-safe `generateRentalNumber` (replace count-then-check with an atomic, tenant-scoped sequence)                                          | COMPLETED |

This work was explicitly scoped to _stabilize and unify_ what
TASK-0006/0007/0008 already shipped — see
[ADR 0009](adr/0009-shared-monthly-pricing-and-atomic-rental-numbering.md).
It did not add a new business module, and TASK-0008 (the next major
task) was not started as part of it.

## TASK-0008 — Document Management Platform (COMPLETED)

**Part 1 (Architecture & Domain Model) — COMPLETED.** A generic `Document`
model covering every document type (`CONTRACT`, `HANDOVER_PROTOCOL`,
`RETURN_PROTOCOL`, `DAMAGE_REPORT`, `CONTRACT_AMENDMENT`, `CUSTOM`, plus a
reserved `QUOTE` value — see [ADR 0010](adr/0010-document-management-platform.md)),
immutable-once-finalized versioning with parent-linked corrections,
concurrency-safe per-type numbering, `DocumentFile` storage (reusing the
existing `StorageService`), a full lifecycle/permission/audit/timeline
layer, and 31 new e2e tests plus unit coverage.

**Part 2 (Rendering, Templates, Sharing, Email, E-Signature Foundation) —
COMPLETED.** Versioned HTML/CSS templates (one `ACTIVE` per
`(tenant, documentType)`, built-in defaults for zero-setup rendering);
universal `{{dot.path}}` variable resolution with HTML escaping and no
hardcoded whitelist; `DocumentRendererService` (live HTML, never
persisted) and `PdfRendererService` (Puppeteer-based PDF, a scoped
exception to [ADR 0007](adr/0007-quotes-and-commercial-offers.md)'s "no
headless browser" — `QuotePdfService`'s `pdfkit` pipeline is untouched);
password-optional, expiring, `POST`-based public share links with view/
download tracking; synchronous email delivery with a durable, retryable
`DocumentEmailDelivery` history; a swappable `DocumentSignatureProvider`
seam (`LocalMockSignatureProvider` only — DocuSign/Adobe Sign/Autenti/
eIDAS named, not implemented); new `documents.render`/`documents.share`/
`documents.templates.view`/`documents.templates.manage` permissions; and
the full frontend UI (document list/detail/preview, template registry/
editor, public share page). See
[ADR 0011](adr/0011-document-rendering-and-sharing.md) for the full
rationale, including the deliberate decision **not** to build a document
"edit" page and **not** to migrate the existing `Quote` module into
`Document` rows.

**Remaining, deliberately deferred work**: a real e-signature provider
integration behind the seam built in Part 2, and a production email
provider behind the existing `EmailProvider` seam (ADR 0007) — see
[HANDOVER.md](HANDOVER.md)'s "Next recommended task".

## TASK-0009 — Customer Portal + Havelio Rebrand (COMPLETED)

A premium, enterprise-grade self-service customer portal — see
[ADR 0012](adr/0012-customer-portal.md) for the full design rationale.

**Auth** — a fully separate customer auth stack (own JWT secret, own
cookie pair, own guard); a portal session can never satisfy a staff route
and vice versa. Login by `tenantSlug + email + password`; invitation-based
onboarding with a partial unique index enforcing one activated account per
`(tenant, email)`.

**Features** — dashboard (rentals/messages/signatures/extensions at a
glance), rentals list/detail/timeline plus a lightweight calendar,
documents (HTML preview, PDF download, e-signature reusing the Document
Management Platform's signature abstraction, one-click ZIP of every
document for a rental), extension requests (approval genuinely extends
the rental via a new `RentalsService.extendPlannedEnd()` capability),
damage reports with photo uploads (staff can convert one into a real,
signable Document), a threaded message center, in-app notifications, and
read-only equipment info with a QR code linking back to the authenticated
rental page.

**Staff side** — a `customers.portal.manage`-gated panel on the existing
customer detail page: invite/revoke portal access, respond to extension
requests, review/convert damage reports, reply to portal messages.

**Rebrand** — every visible UI string, page title, browser tab title,
email template, and generated-document footer now reads "Havelio"
instead of "RentOS." Internal package/module/cookie names are
deliberately unchanged (see ADR 0012 decision 10).

**Remaining, deliberately deferred work** (candidate TASK-0010 scope): a
real e-signature provider integration, a production email provider
(which would also unlock portal notification emails), or a new business
module (invoicing/payments) — see [HANDOVER.md](HANDOVER.md)'s "Next
recommended task".

## Planned major tasks (TASK-0010 onward)

This is the agreed development sequence after TASK-0009, recorded here
so a future session doesn't have to reconstruct it from conversation
history. Every task in this section must follow the "Future task
contract" in [`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md#5-future-task-contract).
None of these has been started; none of the scope bullets below is a
built feature yet.

### TASK-0010 — Complete UI/UX Redesign

**Status: IN PROGRESS** (Part 2 Chapter 2 of 6 complete — see
[`UI_REDESIGN_PLAN.md`](UI_REDESIGN_PLAN.md))

> The brand and design-token foundation this task builds on is already
> in place: [`BRAND_GUIDELINES.md`](BRAND_GUIDELINES.md) (colors,
> typography, spacing, radius, shadows, motion, icons, voice),
> [`UI_PATTERNS.md`](UI_PATTERNS.md) (every reusable component pattern
> and its states), and [`UX_PRINCIPLES.md`](UX_PRINCIPLES.md) (30
> permanent behavioral rules) — see D-041 in `DECISIONS.md`. TASK-0010
> is where these get _applied_ across every existing page; it does not
> redefine them. Part 2 additionally produced
> [`UI_RESEARCH.md`](UI_RESEARCH.md), [`UI_AUDIT.md`](UI_AUDIT.md),
> [`UI_COMPONENT_INVENTORY.md`](UI_COMPONENT_INVENTORY.md), and
> [`UI_REDESIGN_PLAN.md`](UI_REDESIGN_PLAN.md) as the required
> research/audit/inventory/plan before any shell code changed.

**Chapter 1 — Application Shell: COMPLETE.** A real, permission-aware
`Sidebar` (fixing a genuine bug — `UI_AUDIT.md` finding #4, a
`TECHNICIAN` role could click a visible "Quotes" nav link straight into
a `403`), `Breadcrumbs`, a shared `PageHeader` component, a unified
`Cmd/Ctrl+K` Command Palette (global-search foundation), an in-header
`TenantSwitcher`, `UserMenu` (theme + language + logout), `QuickCreate`,
and an honestly-empty staff `NotificationsMenu` placeholder (no backend
exists yet — see finding #7) all shipped, replacing the previous flat
top-bar nav. `UserMenu` also added runtime language switching
(`i18n.changeLanguage`) as a staff-shell control for the first time —
previously the app language was only set once at init. New
`@rentos/ui` primitives: `DropdownMenu`, `Dialog`, `Skeleton`. A
`--z-*` token scale (`sticky`/`overlay`/`drawer`/`dropdown`/`modal`/
`toast`/`tooltip`, see D-042 in `DECISIONS.md`) was also added, since
this chapter is the first time dialog/dropdown/drawer patterns existed
as real components — replacing ad hoc `z-30`/`z-40`/`z-50` guesses with
one ordered source of truth. See `UI_REDESIGN_PLAN.md` Chapter 1 for
the full design rationale and what was deliberately deferred
(retrofitting `PageHeader` to every page, a real dashboard, a real
notifications backend).

**Chapter 2 — Premium Authentication Experience: COMPLETE.** Every
real account-entry screen (`/login`, `/register`, `/app/select-tenant`,
`/portal/login`, `/portal/invite/[token]`) rebuilt on shared
`apps/web/src/components/auth/` primitives (`AuthShell`, `AuthCard`,
`AuthField`/`PasswordField`, `AuthAlert`, `AuthSuccessState`) — see
D-043 in `DECISIONS.md`. Fixes two real gaps: no password-visibility
toggle anywhere (`UI_AUDIT.md` finding #12), and `register`'s two-/
three-column field rows not collapsing on mobile. `Alert` gained
`success`/`warning`/`info` variants. Two flows named in the chapter's
own brief — staff invitation into an existing tenant, and password
recovery on either auth stack — do not exist anywhere in the codebase
(confirmed by exhaustive grep, not assumed) and were **not** built;
see `UI_AUDIT.md` findings #13–14 for what a future task adding either
backend capability would need. See `UI_REDESIGN_PLAN.md` Chapter 2 for
the full design rationale.

- Premium modern staff interface, built on the existing `@rentos/ui`
  (shadcn/ui-based) component set and Tailwind conventions — not a new
  design system from scratch.
- Coherent design system: consistent spacing, typography, and
  component variants across every module's list/detail/settings pages.
- Dashboard redesign (a dedicated staff dashboard does not exist
  today — `app/app/page.tsx` is currently a minimal landing page).
- Navigation and information architecture.
- Tables, cards, forms, calendars, timelines, empty states, loading
  states, error states — applied consistently across Customers,
  Assets, Rentals, Quotes, the Document platform, and the staff-side
  Customer Portal panel.
- Responsive behavior and dark mode (the Customer Portal already has a
  working dark-mode toggle and `.dark`-class CSS variables in
  `packages/ui/src/styles/theme.css` — TASK-0010 extends the same
  mechanism to the staff app, it does not invent a new one).
- Accessibility (real `<label>`s, keyboard navigation — already a
  stated principle in `PRODUCT_PRINCIPLES.md`, this task is where it
  gets audited, not just followed ad hoc).
- Command palette, global search, keyboard shortcuts — new UI
  surfaces, none of which exist yet.
- Performance and perceived performance (loading states, optimistic
  UI where safe).
- **No business-logic rewrite.** This task changes presentation only;
  pricing, permissions, lifecycle, numbering, and every backend
  endpoint contract stay exactly as they are (see
  [`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md) Part 1).

### TASK-0011 — SaaS Plans, Subscription Billing & Entitlements

**Status: PLANNED**

- Plans: Basic, Classic, Professional.
- Monthly and annual billing, with a 30% annual discount.
- Customer limits and employee limits per plan.
- Branches and warehouses available only on the Professional plan.
  **Dependency note**: no branches/warehouses data model exists in
  the schema today (`Asset.currentLocationText` is free text, not a
  structured location entity) — this task's entitlement gating
  presumes that feature exists, so building the actual
  branches/warehouses model is in scope for this task, or must be
  sequenced immediately before it.
- Feature entitlements — a general mechanism for gating features by
  plan, reusable beyond just branches/warehouses.
- Trial and subscription lifecycle (start, renew, expire, cancel,
  reactivate).
- A payment-provider abstraction, following the same swappable-adapter
  pattern already established for storage/email/signature (ADR 0005,
  ADR 0007, ADR 0011) — the specific provider is chosen and
  implemented later, not in this task.
- Explicitly **do not** confuse this SaaS subscription billing (what a
  tenant pays _this_ platform) with rental customer invoicing (what a
  tenant's own customers pay _them_ for a rental) — the latter is a
  separate, not-yet-scheduled capability (see "Not yet scheduled"
  below).

### TASK-0012 — Public Booking Website

**Status: PLANNED**

- Public catalog of a tenant's rentable assets.
- Availability display, reusing the existing `AvailabilityService`
  (ADR 0006) — not a second availability implementation.
- Quote or booking request flow.
- Tenant branding on the public-facing pages.
- No duplicated rental/quote logic — this is a new public entry point
  into the existing Rentals/Quotes engines, following
  [`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md) 1.4.
- Anti-abuse and rate limiting on every public, unauthenticated
  endpoint (the existing public Quote-acceptance and Document-share
  controllers already use `@Throttle(...)` — extend that pattern, not
  a new one).

### TASK-0013 — Advanced Operations Calendar

**Status: PLANNED**

- Drag-and-drop planning.
- Rentals, reservations, delivery, pickup, and service events in one
  operational calendar (broader than the Customer Portal's existing
  lightweight per-customer rental calendar from TASK-0009).
- Conflict checking, reusing `AvailabilityService` rather than a new
  overlap-detection implementation.
- Permission-gated per action.
- Calendar integrations (Google/Microsoft) are explicitly a later
  concern — see TASK-0017.

### TASK-0014 — Mobile PWA & Field Operations

**Status: PLANNED**

- Handover and return flows for field staff.
- Photo capture.
- Signatures, reusing the existing `DocumentSignatureProvider` seam
  (ADR 0011) rather than a second signature mechanism.
- QR-code scanning against the existing `Asset.qrCodeValue` field
  (already generated by the Customer Portal's rental QR code, TASK-
  0009 — this task is the _scanning_ counterpart on the field-staff
  side).
- Damage reporting, reusing the existing `RentalDamageReport` model
  (TASK-0009) rather than a new one.
- Offline-aware architecture is a stated future direction, not a
  requirement of this task's first iteration.

### TASK-0015 — Background Jobs & Notifications

**Status: PLANNED — ADR required before implementation**

- Queue architecture (the stack already anticipates BullMQ, per
  `HANDOVER.md`'s tech-stack table, but nothing is wired in yet).
- Email notifications, reusing the existing `EmailProvider` seam.
- Telegram, WhatsApp, and push notification channels — new provider
  implementations, following the same swappable-adapter pattern.
- Scheduled reminders (upcoming returns, expiring quotes) — today
  these are evaluated lazily on next read/action, not on a schedule;
  this task is what makes proactive reminders possible.
- Retry and dead-letter behavior.
- Per
  [`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md) Part 3, introducing
  queues/background jobs requires a new ADR before implementation —
  this is not optional for this task.

### TASK-0016 — Analytics & Business Intelligence

**Status: PLANNED**

- Revenue, utilization, profitability, asset performance, and
  customer metrics.
- Forecasts.
- Export.
- Must read from existing canonical data sources (pricing snapshots,
  audit logs, status history) rather than introducing a second,
  competing computation of any value that already has one — see
  [`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md) 1.4 and Part 2.

### TASK-0017 — Accounting & External Integrations

**Status: PLANNED**

- Potential integrations: accounting systems, payment systems, Google
  and Microsoft calendars, Zapier/Make, signature providers (a real
  DocuSign/Adobe Sign/Autenti/eIDAS implementation behind the existing
  `DocumentSignatureProvider` seam belongs here or in an earlier
  focused task — not yet decided).
- No hardcoded provider coupling — every integration is a new
  implementation behind an existing or new provider interface,
  per [`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md) 1.15.

### TASK-0018 — Public API v1, Webhooks & SDK

**Status: PLANNED**

- API keys and scopes.
- Rate limits.
- Webhook signing and retries.
- Versioning (additive on top of the existing REST surface, per
  [`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md) Part 3's "changing
  public API compatibility policy" ADR requirement — v1 itself doesn't
  need an ADR to _introduce_, but any later breaking change to it
  does).
- Audit coverage for API-key-authenticated actions, reusing
  `AuditService`.
- Developer documentation.

### TASK-0019 — Platform Extensions

**Status: FUTURE**

- Plugins.
- Template marketplace.
- Integration marketplace.
- Partner ecosystem.

### TASK-0020 — AI Assistant & Workflow Automation

**Status: FUTURE**

- Natural-language operations (e.g. drafting a quote from a
  description), matching the AI-first direction already stated in
  [`VISION.md`](VISION.md).
- Explain-before-execute: a proposed action is shown before it runs.
- Permission-aware actions — an AI-initiated action is still gated by
  the acting user's real permissions, never a bypass.
- Full auditability of AI-initiated actions via the existing
  `AuditService`.
- Human approval required for high-impact operations.
- **No autonomous destructive actions** — this is a hard rule, not a
  default that can be configured away, matching
  [`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md) Part 4.

### Not yet scheduled

Real gaps that exist today and aren't covered by TASK-0010 through
TASK-0020 above — listed so they aren't lost, not because they're
imminent:

| Item                                                                                                                                                | Status            |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Rental customer invoicing, deposit collection/refund workflows (distinct from TASK-0011's SaaS subscription billing — see that task's note above)   | PLANNED           |
| Maintenance/repair workflows                                                                                                                        | PLANNED           |
| GPS tracking                                                                                                                                        | PLANNED           |
| Portal notification emails/push (in-app only today)                                                                                                 | PLANNED           |
| Production email sending (a real SMTP/SES/SendGrid provider — a logging/dev provider ships today)                                                   | PLANNED           |
| OAuth, password reset, two-factor authentication                                                                                                    | PLANNED           |
| Quote/Document template customization editor (`quotes.manageTemplates` and `documents.manageTemplates` permissions already reserved, no editor yet) | PLANNED           |
| Predictive maintenance / asset intelligence                                                                                                         | FUTURE            |
| Marketplace/platform layer beyond TASK-0019's scope                                                                                                 | FUTURE (unscoped) |

## Technical debt

| Item                                                                                                                                    | Status                   | Notes                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permission model is resource-level, not field/value-level                                                                               | TECHNICAL DEBT           | e.g. TECHNICIAN's `assets.update` isn't restricted to only condition/location fields — documented in [api.md](api.md#permissions) and ADR 0004.                                                                                                                                                                      |
| Public quote page doesn't display the tenant's company name (only the generated PDF does)                                               | TECHNICAL DEBT           | Deliberately deferred in ADR 0007; requires the public response builder to fetch `Tenant.name`.                                                                                                                                                                                                                      |
| No scheduled/background-job infrastructure                                                                                              | TECHNICAL DEBT / PLANNED | Blocks automated reminders (upcoming returns, expiring quotes) until BullMQ (or equivalent) is wired in — see TASK-0015 above.                                                                                                                                                                                       |
| No architecture-boundary ESLint rule enforcing the provider-seam pattern (1.15) or the ban on cross-module business-logic forking (1.4) | TECHNICAL DEBT           | Considered alongside the other governance safeguards below and deferred — no import-boundary ESLint plugin is configured in this repo yet, and adding one is a larger, separate change than a CI-check addition; see D-040. Currently enforced by code review + [`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md) only. |

Resolved by the pre-TASK-0008 stabilization task (see [DECISIONS.md](DECISIONS.md) for
the record): the pre-existing count-then-check race in
`generateRentalNumber`, and the inconsistency between Rentals'
tenant-configurable monthly billing and Quotes' fixed whole-month
rounding.

Resolved by this governance task (D-040): localization key-parity across
the 6 languages, and backend/frontend permission-registry sync, are now
both enforced automatically in CI (`pnpm check:governance`) instead of
verified by hand per task — see [`scripts/README.md`](../scripts/README.md).

## Dependencies between modules

```
Auth/Tenancy (ADR 0001)
  └─ every tenant-scoped module below

Assets (ADR 0002-0005)
  └─ Rentals (RentalItem.assetId)
       └─ Quotes (QuoteItem.assetId for ASSET-type lines; quote-to-rental conversion)

Rentals' pricing engine + RentalBillingSettings (ADR 0008)
  └─ Quotes' MONTHLY pricing (shared, not duplicated — ADR 0009)

Rentals' numbering (rental-numbering.util.ts)
  └─ Quotes' quote-to-rental conversion (reuses the same generator)
  └─ Document platform's numbering (document-numbering.util.ts, ADR 0010 — same atomic-upsert pattern, separate counters)

Document Management Platform (ADR 0010 Part 1 + ADR 0011 Part 2, TASK-0008)
  ├─ optionally references Customer/Rental/Quote/Asset (all nullable FKs, no hard dependency)
  ├─ reuses StorageService (ADR 0005) for DocumentFile — no new storage code
  ├─ reuses EmailProvider (ADR 0007) for DocumentEmailService — no new email code
  ├─ reuses PasswordService (argon2) for optional share-link passwords
  └─ real e-signature provider integration not yet started (seam only, see ADR 0011)

Customer Portal (ADR 0012, TASK-0009) — own auth stack, never imports AuthModule
  ├─ wraps RentalsService (adds RentalsService.extendPlannedEnd() for extensions)
  ├─ wraps DocumentsService/DocumentRendererService/DocumentPdfService/DocumentSignatureService
  ├─ wraps AssetFilesService (equipment images) and AssetsService (equipment info)
  ├─ reuses StorageService (ADR 0005) for damage-report photos
  ├─ reuses EmailProvider (ADR 0007) for invitation emails
  └─ RentalDamageReport bridges into Document only via staff-initiated convertToDocument()
```
