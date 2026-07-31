# RentOS Roadmap

Status legend: **COMPLETED** · **IN PROGRESS** · **NEXT** · **PLANNED** ·
**FUTURE** · **TECHNICAL DEBT**

Dates below are commit-history-derived where available; where the
repository doesn't record a completion date, none is invented.

## Completed

| Module                                                                         | Status    | Notes                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production infrastructure, monorepo, CI                                        | COMPLETED | Turborepo + pnpm workspaces, Docker Compose, GitHub Actions.                                                                                                                                                                                            |
| Authentication & tenant onboarding                                             | COMPLETED | Commit `c370234`. See [ADR 0001](adr/0001-authentication-and-tenant-context.md).                                                                                                                                                                        |
| Multitenancy (`TenantGuard`, membership verification)                          | COMPLETED | Part of the same ADR 0001 work.                                                                                                                                                                                                                         |
| RBAC / granular permissions (`PermissionsGuard`)                               | COMPLETED | Extended with every subsequent module (Assets, Rentals, Quotes, rental billing settings).                                                                                                                                                               |
| Audit logging infrastructure                                                   | COMPLETED | `AuditService`, used by every mutating action across all modules.                                                                                                                                                                                       |
| Customers module                                                               | COMPLETED | Commit `0f9c1f8`. Full CRUD, search, soft delete.                                                                                                                                                                                                       |
| Universal Assets module                                                        | COMPLETED | Commit `a50f3be`. Categories, tenant-configurable statuses, custom fields, images/documents, timeline. See [ADR 0002](adr/0002-universal-asset-model.md)–[ADR 0005](adr/0005-asset-file-storage-strategy.md).                                           |
| Rentals module (TASK-0006): lifecycle, availability engine, base pricing       | COMPLETED | Commit `aa77fa9`. See [ADR 0006](adr/0006-rental-lifecycle-and-availability.md).                                                                                                                                                                        |
| MONTHLY billing fix: real calendar-month arithmetic (not flat 30 days)         | COMPLETED | Commit `bb0cbf1`, ahead of TASK-0007.                                                                                                                                                                                                                   |
| Quotes and Commercial Offers module (TASK-0007)                                | COMPLETED | Commit `934cdeb`. Quote wizard, universal line items, PDF generation, email abstraction, public token-based acceptance, quote-to-rental conversion, duplication. See [ADR 0007](adr/0007-quotes-and-commercial-offers.md).                              |
| Configurable monthly billing strategies — Rentals                              | COMPLETED | Commit `744aec8`. `CALENDAR_MONTH` (default) / `FIXED_30_DAYS` / `CUSTOM`, tenant-scoped settings, per-item historical snapshot. See [ADR 0008](adr/0008-configurable-monthly-billing-strategies.md).                                                   |
| Document Management Platform — Part 1 (Architecture & Domain Model, TASK-0008) | COMPLETED | Generic `Document`/`DocumentVersion`/`DocumentFile`/`DocumentItem` model, immutable versioning, per-type atomic numbering, granular permissions. No visual layouts/rendering/e-signature yet. See [ADR 0010](adr/0010-document-management-platform.md). |

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

## TASK-0008 — Document Management Platform

**Part 1 (Architecture & Domain Model) — COMPLETED.** A generic `Document`
model covering every document type (`CONTRACT`, `HANDOVER_PROTOCOL`,
`RETURN_PROTOCOL`, `DAMAGE_REPORT`, `CONTRACT_AMENDMENT`, `CUSTOM`, plus a
reserved `QUOTE` value — see [ADR 0010](adr/0010-document-management-platform.md)),
immutable-once-finalized versioning with parent-linked corrections,
concurrency-safe per-type numbering, `DocumentFile` storage (reusing the
existing `StorageService`), a full lifecycle/permission/audit/timeline
layer, and 31 new e2e tests plus unit coverage. **Deliberately not built**:
visual PDF/HTML layouts, template authoring/rendering, e-signature
integration, any public/customer-facing endpoint, and frontend UI — see
ADR 0010's "Deliberately not built in Part 1" section.

**Part 2 and beyond — NEXT, not yet started.** Expected direction: a real
rendering engine turning a `DocumentVersion`'s `businessDataSnapshot` into
an actual PDF/HTML `DocumentFile` (reusing the `pdfkit` pattern already
proven for Quotes), template authoring against the existing
`DocumentTemplate` registry, a document signature workflow (replacing the
current staff-asserted `sign`/`reject` actions with a real provider), a
public/customer-facing view-and-sign flow (mirroring Quotes'
token-based `/public/quotes/:token` pattern), frontend UI (list/detail
pages, a document wizard), and — once the platform has proven itself on
these new types — a possible future bridge of the existing Quote module
into a `Document` row (see ADR 0010's rationale for why that bridge is
explicitly deferred, not attempted in Part 1).

## Later product phases

| Phase                                                                                                        | Status            |
| ------------------------------------------------------------------------------------------------------------ | ----------------- |
| Payments, invoicing, deposit collection/refund workflows                                                     | PLANNED           |
| Maintenance/repair workflows                                                                                 | PLANNED           |
| Branches, warehouses, GPS tracking                                                                           | PLANNED           |
| Customer portal (authenticated customer accounts, self-service booking, payment)                             | PLANNED           |
| Production email sending (a real SMTP/SES/SendGrid provider — a logging/dev provider ships today)            | PLANNED           |
| OAuth, password reset, two-factor authentication                                                             | PLANNED           |
| Background jobs (BullMQ)                                                                                     | PLANNED           |
| Theming                                                                                                      | PLANNED           |
| Quote PDF/email template customization (`quotes.manageTemplates` permission already reserved, no editor yet) | PLANNED           |
| Mobile application                                                                                           | FUTURE            |
| Public/partner API, third-party integrations, webhooks                                                       | FUTURE            |
| Predictive maintenance / asset intelligence                                                                  | FUTURE            |
| AI-performed operational workflows (beyond conversational assistance)                                        | FUTURE            |
| Marketplace/platform layer                                                                                   | FUTURE (unscoped) |

## Technical debt

| Item                                                                                      | Status                   | Notes                                                                                                                                           |
| ----------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Permission model is resource-level, not field/value-level                                 | TECHNICAL DEBT           | e.g. TECHNICIAN's `assets.update` isn't restricted to only condition/location fields — documented in [api.md](api.md#permissions) and ADR 0004. |
| Public quote page doesn't display the tenant's company name (only the generated PDF does) | TECHNICAL DEBT           | Deliberately deferred in ADR 0007; requires the public response builder to fetch `Tenant.name`.                                                 |
| No completeness-checking tool for localization key parity across the 6 languages          | TECHNICAL DEBT           | Currently verified manually/by script per task; a repo-level lint check would catch drift automatically.                                        |
| No scheduled/background-job infrastructure                                                | TECHNICAL DEBT / PLANNED | Blocks automated reminders (upcoming returns, expiring quotes) until BullMQ (or equivalent) is wired in.                                        |

Resolved by this stabilization task (see [DECISIONS.md](DECISIONS.md) for
the record): the pre-existing count-then-check race in
`generateRentalNumber`, and the inconsistency between Rentals'
tenant-configurable monthly billing and Quotes' fixed whole-month
rounding.

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

Document Management Platform (ADR 0010, TASK-0008 Part 1)
  ├─ optionally references Customer/Rental/Quote/Asset (all nullable FKs, no hard dependency)
  ├─ reuses StorageService (ADR 0005) for DocumentFile — no new storage code
  └─ Part 2+ (rendering/templates/signatures/public flow/frontend UI) not yet started
```
