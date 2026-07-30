# RentOS Roadmap

Status legend: **COMPLETED** · **IN PROGRESS** · **NEXT** · **PLANNED** ·
**FUTURE** · **TECHNICAL DEBT**

Dates below are commit-history-derived where available; where the
repository doesn't record a completion date, none is invented.

## Completed

| Module                                                                   | Status    | Notes                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production infrastructure, monorepo, CI                                  | COMPLETED | Turborepo + pnpm workspaces, Docker Compose, GitHub Actions.                                                                                                                                                               |
| Authentication & tenant onboarding                                       | COMPLETED | Commit `c370234`. See [ADR 0001](adr/0001-authentication-and-tenant-context.md).                                                                                                                                           |
| Multitenancy (`TenantGuard`, membership verification)                    | COMPLETED | Part of the same ADR 0001 work.                                                                                                                                                                                            |
| RBAC / granular permissions (`PermissionsGuard`)                         | COMPLETED | Extended with every subsequent module (Assets, Rentals, Quotes, rental billing settings).                                                                                                                                  |
| Audit logging infrastructure                                             | COMPLETED | `AuditService`, used by every mutating action across all modules.                                                                                                                                                          |
| Customers module                                                         | COMPLETED | Commit `0f9c1f8`. Full CRUD, search, soft delete.                                                                                                                                                                          |
| Universal Assets module                                                  | COMPLETED | Commit `a50f3be`. Categories, tenant-configurable statuses, custom fields, images/documents, timeline. See [ADR 0002](adr/0002-universal-asset-model.md)–[ADR 0005](adr/0005-asset-file-storage-strategy.md).              |
| Rentals module (TASK-0006): lifecycle, availability engine, base pricing | COMPLETED | Commit `aa77fa9`. See [ADR 0006](adr/0006-rental-lifecycle-and-availability.md).                                                                                                                                           |
| MONTHLY billing fix: real calendar-month arithmetic (not flat 30 days)   | COMPLETED | Commit `bb0cbf1`, ahead of TASK-0007.                                                                                                                                                                                      |
| Quotes and Commercial Offers module (TASK-0007)                          | COMPLETED | Commit `934cdeb`. Quote wizard, universal line items, PDF generation, email abstraction, public token-based acceptance, quote-to-rental conversion, duplication. See [ADR 0007](adr/0007-quotes-and-commercial-offers.md). |
| Configurable monthly billing strategies — Rentals                        | COMPLETED | Commit `744aec8`. `CALENDAR_MONTH` (default) / `FIXED_30_DAYS` / `CUSTOM`, tenant-scoped settings, per-item historical snapshot. See [ADR 0008](adr/0008-configurable-monthly-billing-strategies.md).                      |

## Current stabilization work (this task, pre-TASK-0008)

| Item                                                                                                                                        | Status      |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Core project documentation (this file and its siblings)                                                                                     | IN PROGRESS |
| Quote monthly-pricing consistency (share the Rentals pricing engine, tenant billing settings, and historical snapshot behavior with Quotes) | IN PROGRESS |
| Race-safe `generateRentalNumber` (replace count-then-check with an atomic, tenant-scoped sequence)                                          | IN PROGRESS |

This work is explicitly scoped to _stabilize and unify_ what TASK-0006/
0007/0008 already shipped — it does not add a new business module, and
TASK-0008 (the next major task) has not been started as part of it.

## Next planned major task

**TASK-0008 — Contracts, Handover & Return Protocols, Document Lifecycle**

Direction (not yet started, not yet scoped in detail): rental
agreements/contracts generated from a Rental, handover protocols
(condition-at-pickup capture) and return protocols (condition-at-return
capture, damage/discrepancy recording), reusable document templates,
generated PDF documents tied to a Rental's lifecycle, a document
signature workflow, and a document lifecycle (draft → sent → signed →
archived, analogous in shape to the Quote lifecycle already shipped).
This will likely reuse: the existing `StorageService` abstraction
(documents), the `pdfkit`-based PDF generation pattern established for
Quotes, the append-only status-history/timeline pattern used by both
Rentals and Quotes, and the granular-permission convention.

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
            └─ TASK-0008 Contracts/Handover (expected to hang off Rental, mirroring Quote's lifecycle shape)

Rentals' pricing engine + RentalBillingSettings (ADR 0008)
  └─ Quotes' MONTHLY pricing (this stabilization task — shared, not duplicated)

Rentals' numbering (rental-numbering.util.ts)
  └─ Quotes' quote-to-rental conversion (reuses the same generator)
```
