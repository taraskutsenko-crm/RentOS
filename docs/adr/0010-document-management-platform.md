# ADR 0010: Document Management Platform (TASK-0008 Part 1)

**Status:** Accepted
**Date:** 2026-07-31

## Context

TASK-0008 asked for the foundation of a universal Document Management
Platform — not a PDF module, not a Contract module, but the generic system
every document-producing workflow in RentOS will eventually be built on:
Quotes/commercial offers, Contracts, Handover Protocols, Return Protocols,
Damage Reports, Contract Amendments, and future types, "without architecture
changes." Part 1 is explicitly scoped to architecture and the domain model
only — no visual PDF layouts, no template authoring UI, no e-signature
integration. Those are later parts.

This ADR records the architecture decisions behind the schema and service
layer added in this task, and is deliberately conservative about what it
builds versus what it names as an extension point for later.

## Decisions

### A single generic `Document` model, not a table per document type

Every document type shares one `Document` row, tagged by a `DocumentType`
enum (`QUOTE`, `CONTRACT`, `HANDOVER_PROTOCOL`, `RETURN_PROTOCOL`,
`DAMAGE_REPORT`, `CONTRACT_AMENDMENT`, `CUSTOM`). `Document` holds no
type-specific columns at all — type-specific structured content lives in
`DocumentVersion.businessDataSnapshot` and `DocumentItem.dataJson`, both
untyped JSON, the same "universal, not industry-hardcoded" principle
already applied to `AssetCustomFieldValue.valueJson` (ADR 0003) and
`QuoteItemType`'s `CUSTOM` escape hatch (ADR 0007). Adding a new named type
later means adding one enum value, not a new table, new service, or new set
of endpoints. `CUSTOM` plus `Document.customTypeName` covers anything not
worth a named enum value at all.

### QUOTE is in the enum, but the existing Quote module is untouched

`DocumentType.QUOTE` exists for taxonomic completeness and future
unification — it signals that a commercial offer is conceptually one of the
document types this platform is meant to eventually cover. TASK-0008 Part 1
deliberately does **not** migrate or duplicate the existing, fully-shipped
`Quote`/`QuoteItem`/`QuoteDocument` module into `Document` rows: the task's
own instructions say "do not rewrite completed modules unnecessarily," and
Quotes already has its own tested lifecycle, numbering (`Q-<year>-######`),
PDF generation, and public-token acceptance flow. A future task may bridge
Quote into the generic platform once it has proven itself on new document
types first; that bridge is explicitly out of scope here. In the meantime,
`Document.quoteId` lets a new document type (e.g. a `CONTRACT`) reference
the `Quote` it originated from.

### "Employee" and "Organization" references, mapped to what already exists

The task's reference list included `Employee` and `Organization` alongside
`Tenant`/`Customer`/`Rental`/`Quote`/`Asset`/`Creator`. This codebase has no
`Organization` entity distinct from `Tenant` — `Tenant` already **is** the
business/organization boundary (see ADR 0001) — so no new field or table
was added for it; `Document.tenantId` is that reference.

`Employee` is `Document.employeeUserId`: the staff member who performed the
real-world action the document records (e.g. the technician who ran a
handover), kept deliberately distinct from `createdByUserId` (who authored
the database row — usually the same person, but not necessarily, e.g. a
manager creating a protocol on a technician's behalf). Both are nullable
`User` foreign keys; there is no separate `Employee` entity, since
`TenantMembership` + `MembershipRole` already model staff membership.

### Four layers, never mixed: Business Data, Template, Rendering/Storage, Version

The task explicitly required these to stay separate. Concretely:

- **Business Data** — `DocumentVersion.businessDataSnapshot` (JSON). The
  structured content a specific version represents.
- **Template** — `DocumentTemplate`, a minimal tenant-scoped registry
  (`id`, `documentType`, `name`, `isDefault`, `isActive`) that
  `DocumentVersion.templateId` can reference. **No template authoring or
  rendering engine exists yet** — this table exists purely as the
  structural extension point for a later part, not implemented content.
- **Rendering/Storage** — `DocumentFile`, one row per rendered or uploaded
  file belonging to a specific `DocumentVersion`. Mirrors
  `QuoteDocument`/`AssetDocument` exactly (`storageKey`,
  `originalFileName`, `mimeType`, `sizeBytes`) and reuses `StorageService`
  as-is (see ADR 0005) — this platform is never tied to local-filesystem
  storage, the same guarantee Quotes/Assets already have. `format`
  distinguishes system-generated renderings (`PDF`/`HTML`/`JSON_SNAPSHOT`)
  from staff-uploaded supporting files (`ATTACHMENT`/`PHOTO`); `DOCX`/`XML`
  are named now as documented future formats with no generator built yet,
  the same "reserve the enum value, build the feature later" convention
  already used for `quotes.manageTemplates`.
- **Version** — `DocumentVersion` itself, described next.

### Versioning: immutable once finalized, corrections always create a new version

This is new architecture — Quotes/Rentals freeze pricing at the _item_
level (ADR 0008) but never version the whole record. Documents need
whole-record versioning because the task frames them as legal records.

The rule implemented: **version 1 is created alongside the `Document` and
starts mutable** (`isFinal = false`) while the document is `DRAFT` —
`DocumentsService.update` edits that version's `businessDataSnapshot` in
place, exactly like editing a Quote while it's still `DRAFT`. **The moment
the document's status leaves `DRAFT`** (the `markReady` action, `DRAFT ->
READY`), that version is finalized: `isFinal = true`, `finalizedAt` set,
and it is never edited again. Any later correction calls
`DocumentsService.createVersion`, which:

1. Is only callable once the current version is already finalized (status
   is not `DRAFT`) — a document still in `DRAFT` should be edited directly
   instead.
2. Requires a `reason` (a correction must explain itself; the initial
   version needs none, since nothing preceded it).
3. Creates a new `DocumentVersion` with `parentVersionId` pointing at the
   version being corrected, and `businessDataSnapshot` either supplied
   fresh or carried forward verbatim from the version being corrected.
4. Resets the document's `status` back to `DRAFT` and bumps
   `currentVersionNumber`, so the correction can itself be reviewed and
   finalized again through the normal `markReady` action.

Every version, finalized or not, is preserved forever — nothing is ever
deleted from `document_versions`.

### Document lifecycle and the transition table

```
DRAFT -> READY -> SENT -> (VIEWED ->) PARTIALLY_SIGNED/SIGNED/REJECTED
                                                    |
                                                    v
                                          (SIGNED/REJECTED/VOIDED) -> ARCHIVED
VOIDED reachable from every non-terminal state.
```

`VIEWED` is a deliberate _optional_ intermediate, not a mandatory gate
before signing or rejecting: `SENT` can move directly to
`PARTIALLY_SIGNED`/`SIGNED`/`REJECTED` too, because staff may record a
signature obtained entirely out-of-band (a scanned wet-ink signature)
without the document ever having gone through an online "viewed" event.
Every transition writes an append-only `DocumentStatusHistory` row
(mirrors `QuoteStatusHistory`/`RentalStatusHistory` exactly,
`changedByUserId` nullable for a future public/customer-facing flow); some
transitions additionally log a distinctly-named audit action (`sent`,
`viewed`, `signed`, `archived`) for a richer timeline entry, mirroring
Quotes' identical either/or split between a generic `quote.status_changed`
and named actions like `quote.sent`.

No e-signature provider integration exists — `sign`/`markViewed`/`reject`
only record staff-asserted outcomes, the same "logging placeholder now,
real provider later" shape already used for `EmailProvider` (ADR 0007).

### Numbering: per-(tenant, documentType) atomic counters, year-scoped only for CUSTOM

`DocumentSequence` mirrors `QuoteSequence`/`RentalSequence`'s proven
`INSERT ... ON CONFLICT DO UPDATE ... RETURNING` atomic-upsert pattern
exactly (see `document-numbering.util.ts`) — genuinely concurrency-safe,
verified under 20 simultaneous HTTP requests in
`test/documents.e2e-spec.ts`, the same real-database concurrency-testing
convention ADR 0009 established for rental numbers.

Each business type has its own flat, non-year-scoped counter and prefix
(`CONTRACT` → `CON-000001`, `HANDOVER_PROTOCOL` → `HD-000001`,
`RETURN_PROTOCOL` → `RT-000001`, `DAMAGE_REPORT` → `DMG-000001`,
`CONTRACT_AMENDMENT` → `AMD-000001`), matching this codebase's existing
`RNT-######` convention. `CUSTOM` is the one year-scoped exception
(`DOC-2026-000001`, matching `QuoteSequence`'s shape) since it is the
catch-all bucket for anything not worth a named type and is expected to
accumulate the most volume over time.

One schema-level subtlety: `DocumentSequence.year` is a required `Int`,
never nullable. Postgres unique constraints treat every `NULL` as distinct
from every other `NULL`, which would silently break the `ON CONFLICT`
upsert's atomicity for non-year-scoped types (two concurrent inserts with
`year = NULL` would never conflict with each other, defeating the whole
point of the atomic counter). Non-year-scoped types use the sentinel value
`0` instead, which behaves as a normal, equal-to-itself value in the unique
index — documented in the schema and in `document-numbering.util.ts`.

`DocumentType.QUOTE` has a reserved prefix in the numbering map for
completeness but is never actually used, since `Document` rows of type
`QUOTE` are never created in Part 1 (see above).

### Permissions: `documents.*`, mirroring Quotes' role-mapping shape

`documents.view/create/update/delete/send/sign/void/archive/download/manageTemplates`
were added to both permission registries. Role mapping: OWNER/ADMIN get
everything; MANAGER gets full lifecycle control except `delete` and
`manageTemplates` (mirrors Quotes exactly); ACCOUNTANT/VIEWER get
`view`+`download` only. TECHNICIAN gets `view`/`create`/`update`/`download`
but not `send`/`sign`/`void`/`archive` — the physical-handling role
produces handover/return/damage-report documents (the same rationale
already documented for TECHNICIAN's Rentals `start`/`return` grants), but
commercial/legal lifecycle decisions (sending, recording a signature,
voiding, archiving) stay with roles that already hold commercial authority
elsewhere in the system.

`documents.manageTemplates` is a reserved extension point (no template
editor exists yet), same convention as `quotes.manageTemplates`.

### No frontend UI in Part 1

The task explicitly frames Part 1 as "architecture and domain model" and
says not to build visual layouts. No frontend types, hooks, pages, or
localization keys were added for the Document platform — this is backend
architecture only, verified through the API directly (391 backend tests,
including 31 new `documents.e2e-spec.ts` scenarios) and a real HTTP
concurrency check against a Dockerized Postgres. Frontend UI is expected in
a later part once template rendering exists to actually show something
meaningful.

## Consequences

- A new document type is, in the common case, an additive `DocumentType`
  enum value plus a numbering-prefix map entry — no schema restructuring,
  no new tables, no new service.
- `businessDataSnapshot`/`dataJson` being untyped JSON means the API layer
  (not the database) is responsible for validating shape per document
  type once real templates/workflows are built in a later part; this is
  the same tradeoff already accepted for `AssetCustomFieldValue.valueJson`.
- Because Quotes were not migrated, there are now two parallel numbering
  systems (`Q-<year>-######` via `QuoteSequence`, and the new
  `DocumentSequence` family) — a deliberate, documented duplication rather
  than a risky rewrite of a shipped module.
- Template authoring, real rendering (PDF/HTML generation from a
  `DocumentVersion`), e-signature integration, and any customer-facing
  view/accept/sign flow are all explicitly deferred to a later part of
  TASK-0008, not this one.
