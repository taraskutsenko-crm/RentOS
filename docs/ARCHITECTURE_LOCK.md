# Architecture Lock

Mandatory guidance for every future development task and every AI
session working in this repository, effective as of the state reached
at the end of TASK-0009 (commit `09fc7c8`). This document is not
aspirational — every principle below is backed by a decision already
made and shipped in this codebase, cited by file path or ADR/decision
ID so it can be checked, not just trusted.

If a future task's instructions conflict with this document, the
conflict must be surfaced to the requester before writing code, not
silently resolved either way.

> **Read [`PRODUCT_BIBLE.md`](PRODUCT_BIBLE.md) first.** It is the
> highest-level product document in this repository — product vision,
> philosophy, and the decision framework every feature is checked
> against before this document's architectural rules are consulted
> for how to build it correctly. This document remains the binding,
> detailed architectural reference; `PRODUCT_BIBLE.md` does not
> replace it.

## How to use this document

1. Read [`PRODUCT_BIBLE.md`](PRODUCT_BIBLE.md) first, then this file
   in full, before starting any task.
2. Read the ADRs (`docs/adr/`) relevant to the module you're touching.
3. Classify your change: does it fit an **extensible area** (Part 2)
   below, or does it touch a **locked principle** (Part 1)? If it's
   locked, does your change actually modify the principle, or just
   extend within it? Modifying a locked principle requires a new ADR
   (Part 3) _before_ implementation, not after.
4. Check your plan against the **forbidden shortcuts** list (Part 4).
5. Follow the **future task contract** (Part 5) for verification and
   documentation before considering the task done.

---

## 1. Locked architectural principles

### 1.1 Universal product architecture

The application must remain usable by any rental business. Never
hardcode a specific industry (vehicles, containers, tools, event
equipment, portable facilities, …) into the schema or business logic.
Industry-specific behavior is expressed through tenant configuration:
custom fields, categories, statuses, templates, or optional modules.

Evidence: `Asset` has no vehicle/container/tool-specific columns —
type-specific attributes live in tenant-defined
`AssetCustomFieldValue` rows (ADR 0002). `QuoteItemType` uses generic
commercial vocabulary (`ASSET`, `SERVICE`, `PRODUCT`, `FEE`,
`DELIVERY`, `COLLECTION`, `LABOR`, `CUSTOM`), never a sector-specific
value (ADR 0007). `DocumentType` covers every business-document shape
with zero type-specific columns; type content lives entirely in
untyped `businessDataSnapshot`/`dataJson` JSON (D-020, ADR 0010).

Test before adding a schema column or enum value: would this make
sense for a construction-equipment yard **and** a furniture-rental
shop **and** an event-AV company? If not, it belongs in tenant
configuration, not the schema.

### 1.2 Multi-tenancy

- Every tenant-owned business entity must carry a `tenantId` column
  and be scoped by it in every query.
- Tenant isolation is enforced server-side only. A tenant ID arriving
  from the client (URL, body, or JWT claim) is never trusted on its
  own.
- Every tenant-scoped route is `/tenants/:tenantId/...`, gated by
  `TenantGuard`, which re-verifies **active** `TenantMembership`
  against the database on every single request (D-001, ADR 0001) —
  never cached, never inferred from a token claim.
- Cross-tenant access returns `404` for "not found, wrong tenant, or
  soft-deleted" (never leaking that a record exists in another
  tenant), and `403` for a valid resource in a tenant the caller isn't
  a member of. This is the established safe-error convention
  (`HANDOVER.md`, "Important API conventions").
- Every new tenant-owned module requires an explicit cross-tenant
  e2e test asserting the safe-error behavior — this is already the
  pattern in every existing `*.e2e-spec.ts` file
  (`rejects cross-tenant ... access`).
- The Customer Portal (ADR 0012) is the sharpest instance of this
  principle in the codebase: it is a second, cryptographically
  isolated auth boundary (own JWT secret, own cookie pair, own guard,
  never importing `AuthModule`) specifically so a portal session can
  never satisfy a staff route or vice versa (D-033). Any future
  customer-facing or partner-facing auth surface must reuse this
  isolation pattern, not weaken it.

### 1.3 Server as source of truth

Pricing, permissions, lifecycle transitions, availability, numbering,
document finalization, and financial calculations are authoritative
on the backend only. The frontend may compute a preview for live UI
feedback, but that value is never trusted or persisted as-is.

Evidence: every `apps/web/src/lib/*-pricing.ts` file is explicitly
documented as an estimate-only mirror; the server always recomputes
`subtotalMinor`/`totalMinor` and snapshot fields on every
create/update regardless of what the client submitted (D-006).
Authorization is `PermissionsGuard` + `@RequirePermissions(...)` on
the server, never a hidden button or a frontend route guard alone —
`apps/web/src/lib/permissions.ts` is explicitly documented as "a UX
convenience only... never a security boundary."

### 1.4 No duplicated business logic

Reuse existing services and shared utilities; extend them, don't fork
them.

Evidence:

- Quotes' `MONTHLY` pricing imports the shared date/month primitives
  from `apps/api/src/rentals/rental-pricing.util.ts` rather than
  reimplementing them (D-013, ADR 0009) — this is the established
  pattern for any future module needing duration- or
  calendar-month-based pricing.
- Every Customer Portal service (`PortalRentalsService`,
  `PortalDocumentsService`, `PortalAssetsService`, …) is an
  ownership-checking _wrapper_ around the equivalent staff-facing
  service, never a reimplementation (D-036, ADR 0012). The one
  genuinely new business method the portal added,
  `RentalsService.extendPlannedEnd()`, was added to the _existing_
  `RentalsService` — not duplicated inside `customer-portal/` —
  precisely to keep this rule intact.
- Rendering (`DocumentRendererService`/`PdfRendererService`),
  storage (`StorageService`), email (`EmailService`/`EmailProvider`),
  numbering (`rental-numbering.util.ts` /
  `quote-numbering.util.ts` / `document-numbering.util.ts`, all
  sharing the same atomic-upsert pattern), and permissions
  (`permission.ts`) each have exactly one implementation, imported
  everywhere they're needed.

### 1.5 Historical financial immutability

Once a Rental or Quote has been priced, a later change to tenant-wide
settings, tax rules, prices, templates, or billing strategy must never
silently change that record's already-stored numbers.

Evidence: `RentalItem`/`QuoteItem` freeze
`monthlyBillingStrategy`/`customMonthLengthDays` at write time; a
later `PATCH /rental-billing-settings` never retroactively touches
existing rows (D-007, D-008, ADR 0008). Only an _explicit_
re-submission of an item list re-reads current settings for that
specific item. Quote-to-rental conversion copies the Rental's totals
verbatim from the Quote's own authoritative totals, never recomputed
(D-014). This generalizes: a discount, a tax rate, a price — once
charged, it stays exactly what was charged unless a human explicitly
edits that specific record. Any future repricing feature must be an
explicit, visible, permission-gated, audited action — never an
automatic side effect of a settings change.

### 1.6 Legal-document immutability

Finalized document versions are never edited in place.

Evidence: a `DocumentVersion` is mutable only while its parent
`Document.status` is `DRAFT`; the moment status leaves `DRAFT`
(`POST .../ready`) the version is finalized forever (`isFinal`,
`finalizedAt`) (D-022, ADR 0010). A correction creates a new
parent-linked version and resets the document to `DRAFT` — it never
mutates the finalized version's content. Rendered HTML/PDF is always
recomputed live from the immutable snapshot at render time and never
persisted as the source of truth (D-029, ADR 0011) — only the
generated PDF output is stored, as a new, additional `DocumentFile`.
A `DocumentSignatureRequest` references one `documentVersionId`; there
is no mechanism anywhere in this codebase that overwrites or silently
regenerates a signed version.

### 1.7 Money handling

- No floating-point arithmetic for money, anywhere.
- Money is always an `Int` in integer minor currency units, paired
  with an ISO 4217 currency code (`String @db.VarChar(3)`).
- Percentages/rates are integer basis points (e.g. `1000` = 10.00%).
- Exactly one `Math.round()` per computation step — chained roundings
  that could compound drift are not permitted.
- No `Decimal` library is used anywhere in this codebase; this is a
  deliberate, repeated decision (D-004, ADR 0002, ADR 0007), not an
  oversight to "fix" later.

### 1.8 Date and timezone handling

- Calendar-month arithmetic uses UTC fields explicitly
  (`date.getUTCMonth()`, `Date.UTC(...)`) — never the host process's
  local timezone.
- Adding N calendar months clamps the day-of-month to the target
  month's actual length (Jan 31 + 1 month = Feb 28/29).
- A rental/quote's `plannedEnd` must be strictly after `plannedStart`,
  validated server-side; duration rounds up any partial day to a full
  billable day and never returns `0` for a valid range.
- Half-open interval overlap checks are used for availability (a
  same-day back-to-back booking is allowed) — do not silently change
  this inclusive/exclusive semantics without an ADR, since it changes
  what counts as a double-booking.
- Any new duration- or calendar-boundary-sensitive logic requires
  leap-year, end-of-month, year-boundary, and timezone-safety tests,
  matching every existing pricing/numbering change's test suite
  (ADR 0008, ADR 0009).

### 1.9 Race-safe numbering

- No count-then-check numbering pattern.
- No process-local (in-memory) locks for a distributed, multi-instance
  concern.
- Business numbers (`RNT-######`, `Q-YYYY-######`, `CON-######`, …)
  are allocated via a database-enforced atomic upsert: one
  `*Sequence` model per counter scope, incremented with
  `INSERT ... ON CONFLICT (...) DO UPDATE SET lastNumber = lastNumber + 1 RETURNING lastNumber`
  inside the same transaction as the record's creation
  (`rental-numbering.util.ts`, `quote-numbering.util.ts`,
  `document-numbering.util.ts` — D-016, D-024, ADR 0009, ADR 0010).
- A `*Sequence` counter's `year` column uses a `0` sentinel instead of
  `NULL` for non-year-scoped types, because Postgres treats every
  `NULL` as distinct from every other `NULL`, which would silently
  break the `ON CONFLICT` upsert's atomicity (D-024).
- Existing historical numbers are never renumbered when a new
  sequence model is introduced; the counter is initialized from the
  tenant's current maximum parsed number, or `0` if none/unparseable,
  so the next generated number cannot collide with history (D-017).

### 1.10 Permission architecture

- Authorization is a named, granular permission string
  (`"<resource>.<verb>"`), checked via `PermissionsGuard` +
  `@RequirePermissions(...)`. Controllers never check
  `MembershipRole` names directly (D-002) — grepping the codebase for
  `MembershipRole ===` inside a controller should find nothing.
- `apps/api/src/permissions/permission.ts` is the single source of
  truth for every `Permission` string and the `ROLE_PERMISSIONS` map;
  `apps/web/src/lib/permissions.ts` mirrors it exactly, structurally
  (same `*_PERMISSIONS` arrays, same `ROLE_PERMISSIONS` shape) — kept
  in sync by hand today (see Part 4 of this document, "Optional
  automated safeguards," for the CI check added alongside this
  document).
- New privileged behavior requires a permission-matrix e2e test (one
  assertion per role at minimum for the granted/denied boundary),
  matching the existing pattern in every module's `*.e2e-spec.ts`.

### 1.11 Auditability

- Every action with commercial, operational, or security significance
  calls `AuditService.log({ tenantId, userId, action, entityType,
entityId, metadata? }, tx?)`, using the established
  `"<entity>.<verb>"` action-name convention (D-010).
- Written inside the same `$transaction` as the action it records,
  wherever the action itself is transactional.
- Audit metadata never contains a password, a token, a hashed token,
  or unnecessary personal data — this is checked by hand on every new
  audit call site today (no automated scrubbing exists; see Part 4).

### 1.12 Migration safety

- Every schema change requires a Prisma migration, generated via the
  non-interactive workflow documented in `HANDOVER.md` ("Migration
  workflow") and applied to **both** the dev and test databases.
- Migrations preserve existing data — prefer new optional/nullable
  columns over required ones with a guessed default
  (`RentalBillingSettings` is an _optional_ per-tenant row for exactly
  this reason).
- Backfills, where unavoidable, must be deterministic and covered by a
  test (e.g. the `RentalSequence`/`DocumentSequence` counter
  initialization from existing data, D-017).
- The schema is never altered outside migration history — no manual
  `ALTER TABLE` against a running database.

### 1.13 Backward compatibility

Do not break existing API response shapes, stored snapshots, document
versions, share links, or completed workflows without an explicit,
documented migration plan and (per Part 3 below) an ADR when the
change is structural. Where a breaking change is genuinely
unavoidable, the ADR must state the compatibility and rollout
behavior explicitly — not leave it implicit.

### 1.14 Localization

- Every customer-visible and staff-visible string lives in
  `packages/localization/src/locales/<lang>/common.json` — never a
  hardcoded literal in a component.
- All **14** shipped languages (`en`, `pl`, `de`, `uk`, `ru`, `es`,
  `fr`, `it`, `pt-BR`, `nl`, `cs`, `zh-CN`, `ja`, `ko` — see
  `packages/localization/src/index.ts`'s `localeRegistry`, the single
  authoritative source for supported-locale metadata as of D-057)
  must carry the same key structure for every module (D-011). This
  has been verified manually/by ad hoc script per task so far; see
  Part 4 below for the CI check now added to make this automatic.
- `packages/localization` must be rebuilt
  (`pnpm --filter @rentos/localization build`) after any
  `common.json` edit — `apps/api`'s plain Node ESM consumption
  requires the compiled `dist/locales` output (a real bug once hit
  and fixed, see `HANDOVER.md`'s localization section).
- Zod validation error `message` values are i18n key strings, not
  display text — this convention must be followed for every new form
  schema.

### 1.15 Storage and provider abstractions

Business services depend on a swappable interface, never a concrete
vendor implementation, for every external-provider concern:

- `StorageService` / `StorageAdapter` (ADR 0005) — local disk today,
  swappable to S3-compatible storage later without touching any
  caller.
- `EmailService` / `EmailProvider` (ADR 0007) — `LoggingEmailProvider`
  today, swappable to a real SMTP/SES/SendGrid provider via a
  different `useClass` binding, with zero caller changes.
- `DocumentSignatureProvider` (ADR 0011) — `LocalMockSignatureProvider`
  today, the seam for DocuSign/Adobe Sign/Autenti/eIDAS later.

A new external provider integration must implement the existing
interface for its category. Do not call a vendor SDK directly from a
domain service.

### 1.16 Testing requirements

- Pricing, numbering, availability, permissions, and tenant isolation
  are never shipped without a test that would fail if the behavior
  regressed (`PRODUCT_PRINCIPLES.md`, "Tests for business-critical
  behavior").
- Concurrency-sensitive logic (numbering, any future distributed
  allocation) is tested against a real Postgres instance, not an
  in-memory mock.
- "Typecheck passes" or "the build succeeds" is not evidence of
  business correctness on its own — it demonstrates absence of type
  errors, nothing about runtime behavior.

### 1.17 Verification requirements

Every major task runs, and reports the result of, all of:
`pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm build`, a Docker Compose build/migrate verification, a real
browser or authenticated-API walkthrough of the new behavior, a
commit, a push, and a GitHub Actions run that is confirmed green
(D-012). A task is not complete until CI is green — "should pass" is
not the same statement as "is green," and only the latter closes a
task.

### 1.18 Documentation as part of implementation

- Every architectural change updates the relevant documentation in
  the same task, not as a follow-up.
- A new significant decision gets an ADR (see Part 3) or, for a
  smaller/process-level decision, a new row in `DECISIONS.md` (see
  that file's own convention — not every decision is ADR-sized;
  D-012, for example, is a process decision recorded directly in the
  register with no dedicated ADR, and this document's own adoption
  follows that same precedent — see D-039).
- `HANDOVER.md` and `ROADMAP.md` must reflect **verified** reality —
  a task's completion state, commit hash, and CI result — never a
  planned or assumed state. `HANDOVER.md`'s own "Latest verified
  state" section is explicitly marked as the first thing to update
  when a task lands new green CI.

---

## 2. Extensible areas

These may evolve freely, using the existing seams, without requiring
an ADR or violating anything in Part 1:

- UI visual design, dashboard layouts, and information architecture
  (this is explicitly the intended shape of TASK-0010).
- Additional document types and templates, within the existing
  `DocumentType` enum's "universal, no type-specific columns" model —
  a genuinely new document _category_ still fits without a schema
  change, since content lives in JSON.
- The no-code document template builder's block model (Pre-Chapter 10,
  D-064): the block JSON is a ProseMirror/Tiptap-compatible structure
  persisted in the pre-existing `DocumentTemplateVersion.variablesSchema`
  column as `{editorFormat: "blocks-v1", blocks: [...]}` — a UI-authoring
  representation only, never itself interpreted by the render pipeline.
  `renderBlocksToHtml()` compiles it down to the same `{{dot.path}}`-
  templated HTML string `DocumentRendererService` already renders, so
  adding new block types or a richer editor UI on top of this
  representation is an extensible-area change, not a locked one — as
  long as the compiled output stays plain `{{dot.path}}` HTML through
  the existing `resolveVariables` engine. One ACTIVE template per
  `(tenantId, documentType, language)` (D-062) is the current uniqueness
  invariant; loosening it further (e.g. per-customer template variants)
  would need a new ADR.
- New `StorageAdapter` / `EmailProvider` / `DocumentSignatureProvider`
  implementations behind the existing interfaces.
- New in-app notification triggers using the existing
  `CustomerNotification` model and `PortalNotificationsService`; a new
  _channel_ (email, push) is an extension of the same seam if it's
  added as another provider-style abstraction, not a rewrite of the
  notification data model.
- New reports/analytics built by reading existing data — as long as
  they don't introduce a second, competing computation of a value
  that already has a canonical source (e.g. a report must reuse
  `computeMonthlyBreakdown`/pricing snapshots, not recompute totals
  independently).
- Industry-configuration packs (pre-built custom-field/category sets
  for a given vertical) — pure tenant-configuration data, not schema
  or code.
- Integrations, once a genuine external system is named and scoped —
  built behind a new provider interface for its category, following
  1.15.
- A versioned public API (TASK-0018) — additive versioning on top of
  the existing REST surface, not a replacement of it.
- AI-assisted workflows that read/propose, with human approval for
  anything that writes or transitions state — see Part 4's
  "no autonomous destructive actions" and TASK-0020's own scope.
- Mobile/PWA clients — consuming the same REST API the web app already
  uses exclusively (the "API-first" principle already guarantees this
  is possible without new backend surface area).
- Additional monthly-billing strategies through the existing
  `MonthlyBillingStrategy` enum + `computeMonthlyBreakdown` strategy
  dispatch — a new strategy value is an extension of 1.5/1.8's
  existing seam, not a new pricing architecture.

The common thread: extension means adding a new implementation behind
an existing seam, or new configuration/content within an existing
universal model — never bypassing the seam to reach a vendor, a
database table, or a computed value directly.

---

## 3. Changes requiring a new ADR before implementation

Write and get the ADR reviewed _before_ writing the implementation, not
after:

- Changing the multi-tenancy model (e.g. schema-per-tenant,
  database-per-tenant, or any change to how `TenantGuard` establishes
  trust).
- Changing authentication architecture (staff or customer-portal) —
  including anything that would let one auth boundary satisfy the
  other's routes.
- Replacing PostgreSQL or Prisma.
- Changing the money-storage convention (integer minor units + ISO
  4217 code) — including introducing a `Decimal` type.
- Changing rental or quote date semantics (inclusive/exclusive
  boundaries, UTC-only arithmetic, the half-open availability overlap
  check).
- Changing pricing authority (client vs. server) or the historical
  snapshot/immutability rules in 1.5.
- Changing legal-document immutability (1.6) — e.g. allowing an
  in-place edit of a finalized `DocumentVersion`.
- Replacing the atomic-numbering architecture (the `*Sequence` +
  `ON CONFLICT` pattern) with anything else.
- Introducing queues or background jobs (BullMQ or otherwise) — named
  explicitly in `ROADMAP.md`'s TASK-0015 as requiring an ADR before
  implementation.
- Changing customer-portal authentication (cookie names, token
  scheme, or the "never imports `AuthModule`" isolation).
- Changing public API compatibility policy (breaking an existing
  response shape, versioning strategy for TASK-0018).
- Introducing event-driven architecture (domain events, pub/sub
  between modules).
- Changing a storage-provider (or email/signature-provider) contract
  — the interface itself, not a new implementation behind it.
- Changing localization architecture (the per-language JSON file
  model, the i18next resource-bundle approach).
- Major monorepo restructuring (package boundaries, build-graph
  changes beyond adding a new package/app in the existing shape).

---

## 4. Forbidden shortcuts

These are prohibited outright, not "avoid where practical":

- Role-name checks (`user.role === "..."` / `MembershipRole ===`)
  inside a controller or business service, instead of
  `@RequirePermissions(...)`.
- Frontend-only authorization — a hidden button or disabled control
  with no matching server-side permission check.
- A tenant-unscoped database query against any tenant-owned table.
- A second implementation of pricing, numbering, rendering, storage,
  or email logic instead of extending the existing one.
- Recalculating a historical Rental/Quote/Document total from current
  tenant settings instead of using the frozen snapshot.
- Editing a finalized (`isFinal`) `DocumentVersion`, or any equivalent
  future "finalized record" in place.
- Floating-point arithmetic for money.
- Count-then-check business numbering (`count() + 1`, then insert and
  hope).
- A process-memory lock (a `Map`, a mutex singleton, `setTimeout`
  debouncing) used to enforce a distributed-safety guarantee that
  needs to hold across multiple server instances.
- A domain service calling a vendor SDK directly instead of going
  through the relevant `*Adapter`/`*Provider` interface.
- A migration that silently drops or destructively rewrites existing
  data without being called out explicitly in the PR/task description
  and, where financial/legal data is involved, in an ADR.
- A test that mocks away the exact behavior it claims to verify (e.g.
  a "pricing" test that stubs `computeItemLineTotalMinor` itself).
- Claiming Docker or browser verification was done when it wasn't —
  skip it and say so, don't fabricate a result.
- A broad rewrite of a stable, shipped module "while I'm in there,"
  without a specific, stated necessity for this task.
- Adding a new user-visible string in only one language.
- Committing a real secret, credential, or non-placeholder API key —
  `.env.example`/`docker-compose.yml` placeholders only.

---

## 5. Future task contract

Copy or reference this checklist at the top of every future TASK
prompt:

- [ ] Inspect the repository and read this document
      (`ARCHITECTURE_LOCK.md`) plus the ADRs relevant to the module(s)
      being touched, before writing any code.
- [ ] Reuse existing services/utilities; do not fork logic that
      already has a canonical implementation.
- [ ] Do not rewrite a completed, stable module without a specific,
      stated reason tied to this task.
- [ ] Preserve tenant isolation — every new tenant-owned table/query
      is scoped, every new module has a cross-tenant e2e test.
- [ ] Preserve historical records — no retroactive recalculation, no
      in-place edits of finalized documents.
- [ ] Add tests: unit for pure logic, e2e for the request path,
      tenant-isolation and permission-matrix coverage for anything
      new, concurrency coverage for anything numbering/allocation
      related.
- [ ] Update documentation in the same task: the relevant ADR (new,
      per Part 3, if applicable), `DECISIONS.md`, `ROADMAP.md`,
      `HANDOVER.md`'s "Latest verified state," and `architecture.md`/
      `api.md` where the change affects them.
- [ ] Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`,
      `pnpm test`, `pnpm build` — all green.
- [ ] Verify with Docker Compose and a real browser/API walkthrough,
      not just automated tests, before calling a user-facing change
      done.
- [ ] Push to `main` and confirm GitHub Actions is green — a task is
      not done on a red or unchecked CI run.
- [ ] Stop at the task's stated boundary — do not start the next
      numbered task in the same session unless explicitly instructed.
