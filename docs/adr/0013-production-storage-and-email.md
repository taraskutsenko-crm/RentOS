# ADR 0013: Production Object Storage and Email Provider Architecture

**Status:** Accepted
**Date:** 2026-08-27

## Context

ADR 0005 shipped `StorageAdapter` (put/read/delete) with exactly one
implementation, `LocalFilesystemStorageAdapter`, and explicitly named a
production S3-compatible adapter as "the documented next step... not built
because there is no bucket to point it at." The equivalent gap existed for
email: `EmailProvider` (ADR 0011 §5, D-093) had exactly one implementation,
`LoggingEmailProvider`, which never actually sends mail.

The POST-PRE-CHAPTER-10 production-infrastructure pass closes both gaps —
implementing the second, real provider behind each of these two
already-proven seams — plus Handover/Return photo attachments (D-108's
deferred-not-blocked finding) reusing the same `DocumentFile` platform
Documents already use for generated PDFs.

## Decisions

### 1. `S3StorageAdapter` — a second `StorageAdapter` implementation, no interface change

`apps/api/src/storage/s3-storage.adapter.ts` implements the exact same
three-method `StorageAdapter` interface via `@aws-sdk/client-s3`, so it
works against AWS S3, Cloudflare R2, Backblaze B2, MinIO, or any other
S3-compatible endpoint — nothing vendor-specific leaks into domain code.
`StorageModule` now binds the adapter via a `STORAGE_DRIVER` env-driven
factory provider (`local` default, `s3` opt-in) instead of a fixed
`useClass` — the only change any existing caller (`AssetFilesService`,
`DocumentFilesService`, `DocumentPdfService`, `QuotePdfService`) needed
was zero, exactly as ADR 0005 predicted. Objects are always written
private (no ACL ever set to public-read); the enforced download path
stays the existing authenticated streaming endpoint pattern
(`GET .../file`, tenant + permission scoped) rather than adding presigned
URL generation — `S3_PUBLIC_BASE_URL` is accepted in config as a reserved
field for a possible future CDN-fronted read path but is not consulted by
anything today. An optional `StorageAdapter.exists(key)` method was added
(implemented by both adapters) for the new storage-usage/health-check
call sites — additive, not a breaking interface change.

### 2. `SmtpEmailProvider` — a second `EmailProvider` implementation, no interface change

`apps/api/src/email/smtp-email.provider.ts` implements `EmailProvider` via
`nodemailer`, provider-neutral (works with Amazon SES SMTP, SendGrid SMTP,
Mailgun SMTP, Postmark SMTP, or a self-hosted relay — anything speaking
SMTP). `EmailModule` binds the provider via an `EMAIL_DRIVER` env-driven
factory (`logging` default, `smtp` opt-in), mirroring `StorageModule`'s
shape exactly. `isConfigured()` returns `true` only when every field the
provider actually needs (host/port/user/password/from) is present — an
`EMAIL_DRIVER=smtp` with incomplete config degrades to "not configured"
rather than crashing the process at boot, matching D-093's existing
truthfulness contract. `EmailProvider` gained two additive members:
`EmailSendResult.messageId` (the transport's own message id on real
acceptance, never fabricated) and an optional `testConnection()` (SMTP's
own `verify()` handshake) — both consumed by the new
`GET .../integrations/email/status` endpoint so Settings can show an
honest NOT_CONFIGURED / CONFIGURED / CONNECTION_TEST_FAILED / READY state
without ever claiming READY without a real successful check.

### 3. Per-domain email-delivery truthfulness, matching Document's existing shape

D-093 already made `DocumentEmailService` check `isConfigured()` before
attempting a send and persist a durable, retryable `DocumentEmailDelivery`
row per attempt — but explicitly left Quote (only an audit-log line on
failure) and Invoice (no email action at all, only `markSent`'s manual
status flip) unaudited. This pass extends the same pattern to both:
`QuoteEmailDelivery` and `InvoiceEmailDelivery` are new tables with the
identical shape (`PENDING/SENT/FAILED/NOT_CONFIGURED`, `errorMessage`,
`providerMessageId`, `sentAt`/`failedAt`) — independent tables, not a
shared polymorphic one, matching the codebase's existing convention of
each domain repeating the same small shape rather than inventing a
generic cross-cutting "Email" entity (see `AssetImage`/`AssetDocument`/
`DocumentFile`/`QuoteDocument` for the identical precedent on the storage
side). `Quote.status`'s SENT transition and `Invoice.sentAt`/`markSent`
are deliberately **untouched** — those represent "the document was
dispatched to the customer" as a business-lifecycle fact, not "the email
transport succeeded," the same separation Document already keeps between
its own status and `DocumentEmailDelivery`. `InvoiceEmailService` is the
first thing that ever actually emails an Invoice; `POST .../invoices/:id/email`
is new, gated by the same `invoices.send` permission as `markSent`.

### 4. Handover/Return photo attachments reuse `DocumentFile`, not a new model

Handover Protocol and Return Protocol are already `Document` rows (generic
platform, `documentType` HANDOVER_PROTOCOL/RETURN_PROTOCOL). The backend
upload/download/delete endpoints for staff-uploaded evidence
(`POST/GET/DELETE .../documents/:id/files...`, `DocumentFilesService`)
already existed from an earlier chapter, using the pre-reserved
`DocumentFileFormat.ATTACHMENT`/`PHOTO` enum values — this pass found them
fully built but never surfaced in the frontend (D-108 undersold this: the
backend gap was zero, only the UI was missing). Two additive fields close
the remaining real gaps: `DocumentFile.category`
(`HANDOVER_CONDITION`/`RETURN_CONDITION`/`DAMAGE`/`OTHER`, optional) and
`DocumentFile.caption` (optional free text). A real correctness gap was
also found and fixed: neither `upload` nor `remove` checked
`Document.status`, so a finalized (non-DRAFT) document's evidence could
previously be added to or deleted — both now throw `ConflictException`
once the document has left DRAFT, mirroring `DocumentsService.update`'s
exact existing guard and making attachment immutability match
`ARCHITECTURE_LOCK.md` §1.6's content-immutability guarantee. The frontend
`DocumentAttachments` component and the Return-vs-Handover comparison
block (which already showed Handover's condition _text_) now also shows
Handover's _photos_ read-only, alongside the existing text reference —
kept deliberately not routed through any new storage abstraction.

### 5. Tenant-object-key strategy and download authorization — unchanged, reused

Every storage key remains server-generated and namespaced
(`tenants/<tenantId>/...`), never client-supplied — this pass added no new
key-generation logic beyond what `StorageService.buildKey` /
`DocumentFilesService.buildKey` already did. Every download remains a
tenant-and-permission-scoped API endpoint, never a raw bucket URL —
`S3StorageAdapter` does not change this even though S3-compatible storage
technically supports public/presigned URLs; the enforced path stays
"through the API" (see decision 1). Cross-tenant denial for the new
attachment/storage-usage/email endpoints is covered by new e2e tests
following the existing convention (wrong-tenant-in-URL → 403 via
`TenantGuard`; own-tenant-URL-but-another-tenant's-resource-id → 404 via
the service's own tenant-scoped lookup, existence never leaked — see
`ARCHITECTURE_LOCK.md` §1.2).

### 6. Health/readiness and storage-usage — additive, read-only

`GET /health` now genuinely exercises Postgres, the bound `StorageAdapter`
(a real put+delete round trip), and Redis (a bare TCP connect — no Redis
client library exists in this codebase yet, since nothing else uses Redis
today; adding one just for a health ping was judged unnecessary weight).
`GET /health/live` is a dependency-free liveness ping, separate from the
dependency-checking readiness endpoint, for orchestrators that distinguish
the two. `GET .../storage/usage` aggregates already-persisted
`sizeBytes`/count metadata across the four attachment/rendering models —
never scans the actual bucket — foundation for a future
billing/quota feature, not one itself.

### 7. What stays deliberately unbuilt this pass

- **Presigned/signed temporary download URLs** — the authenticated
  streaming endpoint remains the enforced path (see decision 1); building
  real presigned-URL issuance is deferred, not blocked.
- **Tenant-managed SMTP credentials in Settings** — no secure per-tenant
  secret-storage primitive exists for this yet (`EncryptionService` today
  only backs `EInvoiceConnection.encryptedCredentials`, a single
  tenant-scoped secret per provider — reusing it for arbitrary SMTP
  credential storage was judged out of scope for this pass); email
  configuration stays environment-level only, exactly as the task's own
  instruction allowed ("prefer environment-level provider configuration
  for this pass and document the limitation").
- **Malware/content scanning** — MIME allow-list + size limit + safe
  server-generated filenames + private storage remain the enforced
  boundary (unchanged from ADR 0005); no scanning engine is implemented or
  claimed.
- **KSeF and e-signature connectivity** — untouched. `KsefProvider` and
  `LocalMockSignatureProvider` remain honestly not-connected/mock; no
  endpoints guessed, no fake success states added.

## Consequences

- A real production deployment is now a configuration change
  (`STORAGE_DRIVER=s3` + bucket credentials, `EMAIL_DRIVER=smtp` + SMTP
  credentials), not a code change — both provider seams already proved
  themselves swappable with zero caller changes, exactly as ADR 0005/0011
  designed them to.
- Generated PDFs and staff-uploaded attachments now survive an application
  restart or horizontal scaling once a real `STORAGE_DRIVER=s3` is
  configured — the local-filesystem default remains dev/test-only and
  explicitly does not survive a fresh container without its named volume.
- Three near-identical `*EmailDelivery` tables now exist
  (`DocumentEmailDelivery`, `QuoteEmailDelivery`, `InvoiceEmailDelivery`)
  rather than one shared table — a deliberate, documented repetition
  matching the codebase's existing per-domain-model convention, not an
  oversight.
- `Quote.status`/`Invoice.sentAt` still do not reflect real email delivery
  outcome by themselves — a caller that wants to know "did the email
  actually go out" must check the relevant `*EmailDelivery` list, not
  infer it from the parent record's status. This is intentional (see
  decision 3) but is a real seam a future UI/reporting feature must
  respect rather than assume away.
