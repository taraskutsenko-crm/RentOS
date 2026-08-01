# ADR 0011: Document Rendering, Templates, Public Sharing, Email, and E-Signature Foundation (TASK-0008 Part 2)

**Status:** Accepted
**Date:** 2026-08-01

## Context

ADR 0010 (Part 1) built the generic `Document`/`DocumentVersion`/`DocumentItem`
domain model but deliberately stopped short of anything that produces a
human-readable artifact: no template engine, no PDF generation, no sharing,
no email, no e-signature. Part 2 completes the platform end to end —
explicitly **not** "a PDF generator" but the enterprise document engine every
future Havelio document type (Commercial Offer, Rental Contract, Handover
Protocol, Return Protocol, Damage Report, Amendment, and future Invoice/
Delivery Note/Purchase Order/Custom types) is built on, without further
architecture changes.

This ADR records the seven architecture decisions behind Part 2.

## Decisions

### 1. Templates are versioned; only content-hash-free, monotonic version numbers, never edited in place

`DocumentTemplate` (the named shell: `documentType`, `name`, `status`,
`currentVersionNumber`) is separated from `DocumentTemplateVersion`
(`versionNumber`, `htmlContent`, `css`, `variablesSchema`, immutable once
created). Editing a template's content (`POST .../versions`) always inserts a
new `DocumentTemplateVersion` row and bumps `currentVersionNumber` — it never
mutates an existing version. This mirrors `DocumentVersion`'s own
immutable-once-created shape from ADR 0010, applied one layer up. Metadata
edits (`name`/`description`) are a separate, in-place `PATCH` since renaming a
template isn't a content change worth versioning.

**Only one `ACTIVE` template per `(tenant, documentType)`** is enforced two
ways: transactionally (`DocumentTemplatesService.activate()` demotes the
previously active template to `DRAFT` inside the same transaction) and
structurally, via a hand-written partial unique index
(`CREATE UNIQUE INDEX ... WHERE status = 'ACTIVE'`) added by raw SQL appended
to the Prisma migration — the same belt-and-suspenders pattern already used
for `AssetImage.isPrimary` (ADR 0005). A template can be `DRAFT` (editable,
never rendered), `ACTIVE` (the one used for new renders of its type), or
`ARCHIVED` (retired, restorable).

### 2. Template resolution has a three-level fallback; every document type renders with zero setup

Rendering resolves a template in this order: (a) the `DocumentVersion`'s own
explicit `templateId` if set, (b) the tenant's current `ACTIVE`
`DocumentTemplate` for that `documentType`, (c) a built-in
`DEFAULT_TEMPLATES` constant (`default-templates.ts`) — never a database row.
This guarantees every document type renders a real, professionally styled
document out of the box for a brand-new tenant that has never touched the
template registry, while still letting a tenant fully customize or replace
the template later. The built-in defaults share one base stylesheet
(`base-document-css.ts`, exported as a template-literal string constant —
**not** a standalone `.css` file, because this codebase's `tsc`-only build
does not copy non-`.ts` assets into `dist/`, the same class of bug already
hit once with localization JSON per `docs/HANDOVER.md`).

### 3. Variables: a plain nested context object plus a pure regex substitution function, not a hardcoded whitelist

`VariableResolverService.buildContext()` assembles one `RenderContext` object
(`company`, `customer`, `employee`, `asset`, `rental`, `quote`, `today`,
`signature`, `notes`, `document`, `data`) from the `Document`/`DocumentVersion`
and their loaded relations. The exported pure function `resolveVariables(html,
context)` walks `{{dot.path}}` placeholders via regex, resolves each through
`getPath()`, HTML-escapes every substituted value (XSS prevention — templates
are tenant-authored, rendered HTML is served to end users via public links),
and falls back to an empty string for unknown or object-typed paths rather
than throwing. "Architecture supports unlimited future variables" is
satisfied by construction: nothing enumerates or validates variable names
against a whitelist, so a new document type or a new context field is usable
in a template immediately, no code change required in the resolver itself.

### 4. Puppeteer for HTML→PDF — a deliberate, narrowly-scoped reversal of ADR 0007

ADR 0007 rejected a headless browser for Quotes' PDF generation and chose
`pdfkit`, an imperative drawing API. That reasoning does not extend to this
platform: quotes have a fixed, code-defined layout, but Document templates
are **arbitrary tenant-authored HTML+CSS** — genuinely requiring a real
layout/rendering engine, which `pdfkit` cannot provide at any reasonable
effort. `PdfRendererService` wraps a lazily-launched, reused-for-the-process
headless Chromium instance (`puppeteer.launch({ args: ["--no-sandbox",
"--disable-setuid-sandbox", "--disable-dev-shm-usage"] })`), converting a
fully-resolved HTML string (inline CSS, no external resources) into a PDF
buffer via `page.pdf()`. **`QuotePdfService` and its `pdfkit` usage are
completely untouched** — this is an additive capability for the new
Document-rendering pipeline only, not a wholesale reversal of ADR 0007.

Docker/Alpine compatibility (Puppeteer's bundled Chromium download is a
glibc build that cannot run on Alpine's musl libc) is handled by skipping
Puppeteer's own download entirely (`PUPPETEER_SKIP_DOWNLOAD=true`, set at the
`base` build stage) and installing Alpine's own `chromium` apk package plus
its runtime dependencies (`nss freetype harfbuzz ca-certificates
ttf-freefont`) in the `runner` stage, pointing `PUPPETEER_EXECUTABLE_PATH` at
it. Puppeteer reads that env var itself whenever `launch()` omits
`executablePath`, so `PdfRendererService` needs no environment-detection
logic of its own — the same executable-path-via-env-var, code-unaware
seam already used by `StorageService`'s adapter selection (ADR 0005).

### 5. Rendering is never persisted as HTML — always regenerated from the immutable snapshot

`DocumentRendererService.renderHtml()` has no storage method at all, by
design: every HTML render is computed fresh from `DocumentVersion`
(immutable business data, per ADR 0010) plus whichever template the
resolution order above selects. Only `DocumentPdfService`'s PDF **output** is
ever written to storage, as a new `DocumentFile` row tied to the version that
produced it (`format: PDF`). This means a template's styling/letterhead can
be updated and immediately affects every future re-render of every document
of that type, while the underlying business facts stay frozen exactly as
recorded — the same "business data vs. presentation" separation ADR 0010's
Business-Data/Template/Rendering-Storage/Version four-layer split already
established, now actually implemented for two of those layers.
`DocumentPdfService.getOrGenerate()`/`getLatest()` implement a simple
generate-once-cache-forever policy per version; `POST .../pdf` forces a fresh
generation (a new `DocumentFile` row), matching Quotes' regenerate-PDF
endpoint shape.

### 6. Public sharing: opaque hashed tokens, POST (not GET), at most one active link per document

`DocumentShareLink` mirrors Quotes' `publicTokenHash` convention (SHA-256,
only the hash ever persisted — see `document-share-token.util.ts`) but as its
own table rather than a column on `Document`, because a document accumulates
a _history_ of links (creating a new one disables, never overwrites, the
previous one) and each link needs its own independent view/download counters
and last-access metadata. **Both public routes are `POST`, not `GET`** —
unlike `PublicQuotesController` — specifically because a share link may be
password-protected (argon2-hashed via the existing `PasswordService`, reused
as-is), and a password must travel in a request body, never a query string;
there is deliberately no unprotected `GET` variant at all, even for
unprotected links, to keep the two code paths (protected/unprotected)
identical and avoid a second, subtly different endpoint shape.
`resolveToken()` returns the same generic "invalid or expired" 404 whether
the token is unknown, expired, or disabled, and a generic 403 for a
missing/incorrect password — never distinguishing which, so the error itself
can't be used to probe for valid-but-expired tokens or confirm password
existence.

### 7. E-signature: a swappable provider abstraction, `LocalMockProvider` only, deliberately decoupled from `Document.status`

This is the third time this codebase applies the same DI-swappable-adapter
shape: `StorageAdapter` (ADR 0005), `EmailProvider` (ADR 0007), and now
`DocumentSignatureProvider` (`DOCUMENT_SIGNATURE_PROVIDER` Symbol token,
bound to `LocalMockSignatureProvider` in `DocumentsModule`). The interface
and `DocumentSignatureRequest`'s own state machine
(`REQUESTED`/`PENDING`/`SIGNED`/`REJECTED`/`EXPIRED`/`CANCELLED`) exist now so
that a real provider (DocuSign/Adobe Sign/Autenti/eIDAS — all named in
`DocumentSignatureProviderType`) can be wired in later via a different
`useClass`, with zero call-site changes, the same guarantee `EmailProvider`
already delivers for outbound mail.

`DocumentSignatureRequest.status` is **deliberately not auto-synced** to
`Document.status` — no real provider/webhook exists yet to drive that
transition correctly (a real webhook would need signature verification,
retry handling, and idempotency that don't make sense to half-build against
a mock). Staff instead separately confirm outcomes via the pre-existing
`documentsService.sign()`/`reject()` actions from ADR 0010. This is a
deliberate, documented scope boundary, not a gap: when a real provider
lands, that's the natural point to add the webhook-driven bridge.

### Email delivery as a durable, retryable resource — not just an audit entry

Unlike Quotes (which only logs a `quote.send_email_failed` audit entry on
failure), `DocumentEmailDelivery` is a first-class row per send attempt
(`recipientType`, `recipientEmail`, `subject`, `message`, `status`,
`errorMessage`, `sentAt`). This is deliberate: "retry" needs something
concrete to re-send, and a document may reasonably be emailed to more than
one recipient over its lifetime (customer, then internally to an employee,
then a corrected custom address) — a single audit-log line can't represent
that history usefully. Sending is still fully **synchronous** in Part 2, per
the task's explicit instruction ("no background jobs yet") — `dispatch()` is
a small private method, named and documented specifically as the future
queue-swap seam, mirroring `EmailModule`'s own reused `EmailProvider`
abstraction (ADR 0007) rather than introducing a second one.

### Frontend: fully built in Part 2, unlike Part 1

ADR 0010 explicitly deferred all frontend work. Part 2 adds the complete UI:
document list/detail/preview page (HTML preview via `iframe[srcDoc]`,
version selector, PDF download/regenerate, full lifecycle actions, inline
share/email/signature panels), template registry and editor (metadata,
content-as-new-version, version history with restore, activate/archive/
duplicate, live client-side preview), and a standalone public share page
(`/share/[token]`, outside `app/app/**`, mirroring `/quote/[token]`'s
no-chrome convention) that transparently handles the password-required flow
returned by the POST-based public endpoints. Documents are not given a full
"edit" page: Part 7's own required-actions list (Preview/Download/Version
selector/History/Timeline/Share/Send/Duplicate/Archive) does not include
editing, and a document's authoritative content is normally populated by the
originating workflow (a rental/quote conversion), not hand-typed by staff —
consistent with how `businessDataSnapshot` is described in ADR 0010.

## Consequences

- Adding a real e-signature provider or a real background job queue later
  requires no call-site changes anywhere in `DocumentsModule` — both seams
  (`DOCUMENT_SIGNATURE_PROVIDER`, `DocumentEmailService.dispatch()`) are
  already isolated exactly where the swap will happen.
- Two headless-rendering approaches now coexist in this codebase (`pdfkit`
  for Quotes, Puppeteer for generic Documents) — a deliberate, documented
  duplication rather than forcing one tool to do a job it's unsuited for, or
  risking a rewrite of Quotes' already-shipped, tested PDF pipeline.
- The production Docker image is measurably heavier (Alpine `chromium` plus
  its shared-library dependencies) than before this task. This was accepted
  as the cost of genuine arbitrary-HTML rendering; it was verified to work
  from a running container as part of this task's Docker verification step
  (see the final task report for the exact verification performed).
- Template content is trusted, tenant-authored HTML — the resolver
  HTML-escapes every _substituted variable value_, but does not sanitize the
  surrounding template markup itself. This mirrors the trust boundary
  already accepted for other tenant-authored content in this codebase and is
  documented here rather than silently assumed.
