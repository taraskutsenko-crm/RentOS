# RentOS Roadmap

Status legend: **COMPLETED** · **IN PROGRESS** · **NEXT** · **PLANNED** ·
**FUTURE** · **TECHNICAL DEBT**

Dates below are commit-history-derived where available; where the
repository doesn't record a completion date, none is invented.

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

## Later product phases

| Phase                                                                                                        | Status            |
| ------------------------------------------------------------------------------------------------------------ | ----------------- |
| Payments, invoicing, deposit collection/refund workflows                                                     | PLANNED           |
| Maintenance/repair workflows                                                                                 | PLANNED           |
| Branches, warehouses, GPS tracking                                                                           | PLANNED           |
| Portal notification emails/push (in-app only today)                                                          | PLANNED           |
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
