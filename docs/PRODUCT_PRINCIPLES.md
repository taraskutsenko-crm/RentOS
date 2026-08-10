# RentOS Product Principles

Practical, implementation-level principles this codebase is expected to
follow. Each one exists because a real decision in this repository
depended on it — these are not aspirational slogans.

## Universal, not industry-hardcoded

**What it means:** no model, enum, or business-logic branch may assume a
specific rental vertical (vehicles, tools, events, …). Anything
industry-specific belongs in tenant-defined configuration (custom
fields, categories, statuses), never in the schema or code.

**In implementation:** `Asset` has no vehicle/container-specific
columns; type-specific attributes live in `AssetCustomFieldValue` (see
[ADR 0002](adr/0002-universal-asset-model.md)). `QuoteItemType` uses
generic commercial vocabulary (`SERVICE`, `FEE`, `DELIVERY`, `LABOR`, …),
never something like `"insurance_waiver"` or `"fuel_surcharge"` baked in
as an enum value. When adding a feature, ask: "would this make sense for
a construction-equipment yard **and** a furniture-rental shop **and** an
event-AV company?" If not, it's tenant configuration, not a schema
change.

## Tenant-safe by design

**What it means:** tenant isolation is not a filter you remember to add —
it's structurally unavoidable.

**In implementation:** every tenant-scoped controller route is
`/tenants/:tenantId/...`, gated by `TenantGuard`, which re-verifies
active membership against the database on every single request (never
trusts a JWT claim or a client-supplied ID). Every Prisma query for a
tenant-scoped model includes `tenantId` in its `where` clause. Every
module's e2e suite includes an explicit cross-tenant-access test
asserting `403`.

## Server as the source of truth

**What it means:** the frontend may estimate, but never decides, a
financial or derived value that gets persisted.

**In implementation:** every `lib/<domain>-pricing.ts` file in
`apps/web` is explicitly commented as "an estimate for live UI feedback
only — the API recomputes and stores the authoritative totals." The
server always recomputes `subtotalMinor`/`totalMinor` and any snapshot
fields on every create/update, ignoring any client-submitted total.

## Historical financial immutability

**What it means:** once a Rental or Quote has been priced, changing a
tenant-wide setting later must never silently change that Rental or
Quote's stored numbers.

**In implementation:** `RentalItem`/`QuoteItem` freeze the
`monthlyBillingStrategy`/`customMonthLengthDays` they were priced under
at write time; a later `PATCH` to `RentalBillingSettings` never
retroactively touches existing rows. Only an _explicit_ re-submission of
the item list re-reads current settings — see
[ADR 0008](adr/0008-configurable-monthly-billing-strategies.md). This
principle generalizes to anything financial: a discount, a tax rate, a
price — once charged, it stays exactly what was charged unless a human
explicitly edits that specific record.

## Fewer clicks for common workflows

**What it means:** the two highest-frequency actions (booking a rental,
preparing a quote) get a guided, purpose-built wizard, not a generic
CRUD form the user has to figure out.

**In implementation:** `RentalWizard`/`QuoteWizard` — customer → assets
→ dates → pricing → review, with live pricing feedback at every step so
a mistake surfaces before submission, not after a failed API call.

## Progressive disclosure

**What it means:** show only the fields relevant to the current choice;
don't show every possible field for every billing mode/item type at
once.

**In implementation:** `QuoteItemRow`/the rental pricing step render
only the price field(s) that match the selected `billingMode` (daily
price for `DAILY`, monthly + daily-for-remainder for `MONTHLY`, etc.);
the `CUSTOM` monthly-billing-strategy's day-length field only appears
when `CUSTOM` is selected on the billing-settings page.

## Professional but simple UX

**What it means:** the UI favors clear, information-dense
cards/tables over decorative complexity — no unnecessary animation,
no unexplained icons-only controls.

**In implementation:** shared `@rentos/ui` component set
(shadcn/ui-based) used consistently across every module's list/detail/
settings pages — no per-module bespoke design system.

## Accessible and responsive

**What it means:** forms have real `<label>`s wired to their inputs,
keyboard navigation works, layouts don't break on a narrower viewport.

**In implementation:** every settings/wizard form uses `<Label
htmlFor=...>` paired with the input's `id`; radio/checkbox groups are
real `<input type="radio/checkbox">` elements, not custom
un-labelled `<div>`s; responsive utility classes (`grid-cols-2`,
`max-w-2xl`, etc.) are the default rather than fixed pixel widths.

## Multilingual from the beginning

**What it means:** no user-facing string ships in only one language;
localization is not a follow-up task.

**In implementation:** every module's rollout, including this
stabilization task's new UI strings, adds keys to **all 14** locale
files (`en`, `pl`, `de`, `uk`, `ru`, `es`, `fr`, `it`, `pt-BR`, `nl`,
`cs`, `zh-CN`, `ja`, `ko` — see `packages/localization/src/index.ts`'s
`localeRegistry`) in the same commit, with key-structure parity
verified before commit (`scripts/check-i18n-parity.mjs`, which
auto-discovers locale folders — adding a language requires no change
to the script itself).

## Consistent design system

**What it means:** one shared component library, one set of Tailwind
conventions, one wizard pattern — reused, not reinvented per module.

**In implementation:** `@rentos/ui` is the only source of buttons,
cards, inputs, alerts, labels across both Rentals and Quotes UI; the
`RentalWizard` and `QuoteWizard` share the same step-index/RHF/
useState-items architecture even though they're separate components.

## Automation over repetitive work

**What it means:** where a calculation or lookup can be done once by the
system, it shouldn't be done manually per record by a human.

**In implementation:** automatic pricing recomputation on every
create/update (never a manual "recalculate" button); lazy quote-expiry
evaluation instead of a human manually marking quotes expired; automatic
asset-status synchronization on rental start/return (best-effort, not
part of the availability guarantee itself — see ADR 0006).

## AI performs workflows, not only conversation

**What it means:** the long-term direction for AI in this product is
task execution (draft a quote, flag a maintenance risk), not just a
chatbot answering questions about data that already exists. This is a
vision-level principle (see [VISION.md](VISION.md)'s AI-first section)
that should bias architecture choices today — e.g. keeping the API
well-typed, deterministic, and independently callable — without
building speculative AI features now.

## Explicit permissions

**What it means:** authorization is a named, granular capability
(`"rentals.reserve"`), checked once via a shared guard/decorator — never
an inline `if (user.role === "MANAGER")` scattered through a controller.

**In implementation:** `PermissionsGuard` + `@RequirePermissions(...)` on
every mutating (and most reading) controller handler;
`apps/api/src/permissions/permission.ts` is the single source of truth
for the role → permission map, mirrored (never duplicated with drift) in
`apps/web/src/lib/permissions.ts`.

## Auditable important actions

**What it means:** every action with commercial, operational, or
security significance leaves a traceable record of who did what, when.

**In implementation:** `AuditService.log(...)` called for every create/
update/delete/status-change/settings-change across every module, written
inside the same transaction as the action itself where the action is
transactional. Audit metadata is scrubbed of secrets (never a token, a
password hash, or a hashed public-access token) even though it can
contain otherwise-useful before/after values.

## Deterministic pricing

**What it means:** given the same inputs, a price calculation always
produces exactly the same output — no hidden state, no wall-clock
dependency inside the calculation itself (only the caller-supplied
dates matter).

**In implementation:** `computeMonthlyBreakdown`,
`computeItemLineTotalMinor`, `computeQuoteItemPricing` are pure
functions — no I/O, no `Date.now()` inside them, no reliance on the host
timezone. This is also what makes historical financial immutability
possible: a frozen snapshot of the pure function's _inputs_ is enough to
reproduce its _output_ forever.

## No floating-point money calculations

**What it means:** never use JavaScript's native floating-point
arithmetic (`Number` with decimals) to represent or calculate money.

**In implementation:** money is always an integer count of minor
currency units (cents); percentages are always integer basis points;
every rounding step uses exactly one `Math.round()`, never chained
roundings that could compound drift. No `Decimal.js` or similar library
is used — integer arithmetic is judged sufficient and simpler to reason
about (see ADR 0002 and ADR 0007's decimal-safe-arithmetic sections).

## Backward-compatible migrations

**What it means:** a schema change must never silently corrupt or
misinterpret existing data, and should not require a destructive,
irreversible data rewrite unless truly unavoidable.

**In implementation:** new optional/nullable columns are preferred over
required ones with a guessed default; `RentalBillingSettings` was
introduced as an _optional_ per-tenant row specifically so existing
tenants needed no backfill (`getEffective()` returns a code-level default
when no row exists); the race-safe rental-numbering work in this
stabilization task initializes its sequence counter from existing
`rentalNumber` data without renumbering any historical rental (see
[DECISIONS.md](DECISIONS.md)).

## API-first extensibility

**What it means:** the REST API is a first-class product surface, not an
implementation detail of the web client — it should be reasonable for a
future consumer (mobile app, partner integration) to use it too.

**In implementation:** the web app has zero server-side-only logic; the
same endpoints documented in [api.md](api.md) are everything the web
client itself uses. New endpoints follow the existing conventions
(pagination shape, error-status conventions, permission gating) so a
future API consumer faces one consistent contract, not per-module
exceptions.

## Tests for business-critical behavior

**What it means:** pricing, numbering, availability, permissions, and
tenant isolation are never shipped without a test that would fail if the
behavior regressed.

**In implementation:** every pricing/numbering change in this codebase's
history has shipped with unit tests for the pure calculation and e2e
tests for the full request path, including edge cases (leap years,
end-of-month, concurrent requests) — not just the happy path.

## No silent destructive changes

**What it means:** anything that could lose data, revoke access, or
alter a stored financial value must be an explicit, visible action —
never an implicit side effect of an unrelated change.

**In implementation:** soft delete (`deletedAt`) instead of hard delete
everywhere history matters; a tenant billing-settings change never
touches existing Rental/Quote rows; destructive UI actions
(delete/cancel) require an explicit confirmation step; migrations in
this codebase are written to preserve existing rows rather than guess-
and-rewrite them (see "Backward-compatible migrations" above).
