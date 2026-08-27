# RentOS — Handover Document

Written so a new developer, or a fresh AI session with zero prior chat
history, can resume work immediately by reading this file plus the
linked docs — without needing to reconstruct context from git log or
prior conversations.

> **Read [`PRODUCT_BIBLE.md`](PRODUCT_BIBLE.md) first, then
> [`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md), before starting any
> task.** `PRODUCT_BIBLE.md` is the highest-level product document —
> vision, philosophy, and the decision framework every feature is
> checked against. `ARCHITECTURE_LOCK.md` is mandatory guidance for
> every future development task and AI session in this repository:
> which architectural principles are locked, which areas are
> extensible, which changes require a new ADR before implementation,
> which shortcuts are forbidden outright, and the verification
> contract every task must satisfy before it's considered done.

## Latest verified state

- **Branch:** `main`
- **Latest verified commit:** see `git log -1` at the time this pass
  concluded (docs: record the POST-PRE-CHAPTER-10 production-infrastructure
  pass, D-109) — the production-infrastructure pass is complete. Scope:
  make the two remaining honest-placeholder provider seams
  (`StorageAdapter`, `EmailProvider`) real, add Handover/Return photo
  attachments, and audit/harden for production deployment — explicitly
  **not** Chapter 10. See D-109 and ADR 0013 for full rationale.
- **What shipped (production-infrastructure pass, D-109 / ADR 0013):**
  `S3StorageAdapter` (`@aws-sdk/client-s3`) is a second `StorageAdapter`
  implementation — works against AWS S3, Cloudflare R2, Backblaze B2,
  MinIO, or any other S3-compatible endpoint — selected via
  `STORAGE_DRIVER=s3` (default `local`) with zero caller changes.
  `SmtpEmailProvider` (`nodemailer`) is a second `EmailProvider`
  implementation — provider-neutral SMTP (SES/SendGrid/Mailgun/Postmark/
  self-hosted) — selected via `EMAIL_DRIVER=smtp` (default `logging`),
  also zero caller changes; a new honest `GET .../integrations/email/status`
  (NOT_CONFIGURED/CONFIGURED/CONNECTION_TEST_FAILED/READY, backed by
  SMTP's own `verify()` handshake, never claims READY without a real
  check) is shown on Settings → Integrations. Handover/Return Protocol
  photo/file evidence: the upload/download/delete backend
  (`DocumentFilesService`/`DocumentFilesController`) turned out to
  **already exist** from an earlier chapter — this pass added the missing
  frontend (`DocumentAttachments` component: thumbnail grid, caption,
  upload, delete), two additive `DocumentFile` fields
  (`category`/`caption`), a real correctness fix (upload/remove now reject
  once the parent document leaves DRAFT — previously unchecked, so
  finalized evidence could silently be added to or deleted), and Return
  Protocol's existing Handover-condition-text comparison block now also
  shows Handover's photos read-only. Email delivery truthfulness (D-093's
  isConfigured()-before-send pattern, previously Document-only) is now
  also applied to Quote (`QuoteEmailDelivery`, new durable/retryable
  table — `Quote.status`'s SENT transition timing is untouched) and
  Invoice (`InvoiceEmailDelivery` + new `InvoiceEmailService`/
  `POST .../invoices/:id/email` — Invoice previously had **no** email
  action at all, only `markSent`'s manual status flip with nothing
  dispatched; that stays untouched too). `GET /health` now genuinely
  round-trips Postgres + the bound `StorageAdapter` + Redis (a bare TCP
  connect — no Redis client library exists elsewhere in the codebase, so
  none was added just for a health ping); new dependency-free
  `GET /health/live`. New `GET .../storage/usage` aggregates
  already-persisted size/count metadata (never scans the bucket) — a
  foundation for a future billing/quota feature, not one itself. **A real
  bug was caught and fixed before shipping:** the new `docker-compose.yml`
  `S3_*`/`SMTP_*` passthroughs use `${VAR:-}` interpolation, which passes
  an _empty string_ when unset, not an unset key — this would have broken
  numeric/boolean env coercion at boot for any deployment that didn't set
  every one of them; `packages/shared/src/env.ts` now has purpose-built
  `optionalPositiveInt()`/`booleanFlag()` helpers with a dedicated
  regression test. **Deliberately not built, all honestly reported (never
  faked):** presigned/signed download URLs (the authenticated streaming
  endpoint remains the enforced path); tenant-managed SMTP credentials in
  Settings (no secure per-tenant secret-storage primitive exists beyond
  the single-purpose `EInvoiceConnection.encryptedCredentials`; email
  config stays environment-level only, as the task explicitly allowed);
  malware/content scanning (MIME allow-list + size limit + private storage
  remain the enforced boundary, unchanged); KSeF and e-signature
  connectivity (both untouched — still honestly not-connected/mock, no
  endpoints guessed, no fake success states).
- **Verification (production-infrastructure pass):** full backend suite
  (43 files / 662 tests, +24 new) and full frontend suite (79 files / 549
  tests, +7 new) green; every quality gate (`format`, `lint` — 0 errors,
  `typecheck` — 9 packages, `build` — 6 packages, `check:governance`)
  green; one new additive Prisma migration
  (`production_infra_attachments_email` — `DocumentAttachmentCategory`
  enum, `DocumentFile.category`/`.caption`, `QuoteEmailDelivery`,
  `InvoiceEmailDelivery`, `DocumentEmailDelivery.failedAt`/
  `.providerMessageId`) applied cleanly to both the dev and test
  databases. `S3StorageAdapter`/`SmtpEmailProvider` were exercised via
  mocked unit tests (not a real external cloud account or real external
  SMTP send — no credentials exist in this environment; `docker-compose.yml`
  gained opt-in `minio`/`mailhog` services, behind `--profile s3`/`--profile
smtp`, for local S3-compatible/SMTP integration testing, not started
  here this pass). Docker images rebuilt from committed HEAD and walked
  through live in a real browser — see the final report for the exact
  scenario results.
- **Previous state (PRE-CHAPTER-10 remaining acceptance gaps closure
  pass, D-106–D-108):** commit `fb4960a` — Rental→Quote now generates a
  real canonical Quote entity (D-106); Handover/Return universal condition
  fields (meter/fuel/battery/accessories), Return-vs-Handover text
  comparison, additional-charge-from-Return workflow, Invoice direct
  print, multi-page PDF/print-quality CSS, and RBAC negative tests for
  `assets.manage_availability`/`rentals.manage_deposit` (D-107);
  Handover/Return photo/attachment support investigated and found
  deferred-not-blocked (D-108, closed by D-109 above). Full details in
  DECISIONS.md.
- **Before that (Asset Availability Engine + Deposit workflow, D-101–D-105):**
  commit `347b742` — the Asset
  Availability Engine + Rental Deposit workflow + Reservation-UX pass is
  complete. This was explicitly QA/fixes + a specific new-feature scope
  (Reservation workflow, Asset Availability architecture, Deposit workflow
  foundation, document/invoice corrections), **not** a new product
  chapter; per this pass's explicit scope-boundary instruction, no
  unrelated roadmap work was started. See D-101 through D-105 in
  [DECISIONS.md](DECISIONS.md) for full rationale on each change.
- **What shipped (Asset Availability Engine + Deposit workflow, D-101–D-105):**
  a new `AssetAvailabilityBlock` model (`MAINTENANCE`/`REPAIR`/
  `INSPECTION`/`RELOCATION`/`MANUAL_BLOCK`, half-open `[startAt, endAt)`
  window, optional `relatedRentalId`) is now unioned into
  `AvailabilityService.checkAvailability` alongside the pre-existing
  RESERVED/ACTIVE `RentalItem` conflicts and a new `permanentReason`
  (`LOST`/`RETIRED` **system** asset status only) — one canonical result
  shape (`{isAvailable, conflicts, blocks, permanentReason}`) every caller
  (Rental/Quote reserve checks, the availability endpoint, both wizards,
  the Availability Calendar) already goes through, so none needed a code
  change to inherit the richer conflict set (D-101). New
  `assets.manage_availability` permission (MANAGER/TECHNICIAN) gates
  scheduling/cancelling blocks via a new Asset detail "Availability /
  schedule" section (D-102). A new `RentalDeposit` accounting model
  (received/returned/retained amounts, method, reference, retention
  reason) implements the workflow D-097 had researched-but-deferred —
  separate from the pre-existing `RentalItem.depositMinor` _required_
  amount — with a new `rentals.manage_deposit` permission
  (MANAGER/ACCOUNTANT), a Rental Workspace deposit-ledger UI, a new
  `DEPOSIT_RECEIPT` document type + EN/PL template + `deposit.*` resolver
  variables (payment method rendered through a localized label, not the
  raw enum value), and a fifth "Deposit receipt" row on the document
  checklist (D-103). The Rental/Quote wizard asset selectors, the Asset
  detail Availability section, and the Availability Calendar all now show
  each asset's nearest conflict/block/permanent-reason as an icon+text+
  dates badge — never hidden, never color-only — sourced from one shared
  `lib/asset-availability-badge.ts`; the Calendar's day cells link to the
  conflicting rental or the asset's Availability section; a returned
  Rental item gained a "Send to repair" link that pre-opens the Asset
  detail block form to `REPAIR` with `relatedRentalId` set, never
  auto-inventing a repair period (D-104). Two real bugs were found and
  fixed only by the required real-Docker browser walkthrough, neither
  caught by the automated suites: a request-storm/429 race in the Rental
  wizard's availability preview (unstable query key recomputed every
  render), and `DEPOSIT_RECEIPT` missing from four separate frontend
  hardcoded `DocumentType` allowlists, silently falling back to `CONTRACT`
  when generating a deposit receipt from the Rental checklist (D-105).
  **Not implemented, explicitly documented as a gap:** automatic invoice
  creation for a retained deposit amount (staff add it as a manual
  invoice line today); Handover/Return Protocol's additional
  meter/fuel-level/comparison-to-handover/additional-charges fields
  (existing `businessData.conditionNotes` structure — asset
  condition/damage description/missing items — was left as-is, not
  extended, this pass); connecting existing photo/attachment
  infrastructure to Handover/Return; a richer
  NOT_SENT/SENT/DELIVERED/OPENED/SIGNED/FAILED signature-status set
  (`LocalMockSignatureProvider` still only ever reports `PENDING`,
  honestly, which was judged not worth expanding for a mock with no real
  capability behind it).
- **Verification:** full backend suite (37 files / 628 tests, +21 new)
  and full frontend suite (79 files / 533 tests, +4 new) green; every
  quality gate (`format`, `lint` — 0 errors, `typecheck` — 9 packages,
  `build` — 6 packages, `check:governance`, `test:governance-checks` —
  16/16) green; one new additive Prisma migration
  (`AssetAvailabilityBlock`, `AssetAvailabilityBlockType`,
  `RentalDeposit`, `DocumentType.DEPOSIT_RECEIPT`) applied cleanly to
  both the dev and test databases. Docker images rebuilt from committed
  HEAD (twice, after each bug fix) and walked through live in a real
  browser against the rebuilt containers with a Russian-UI/Polish-company
  tenant: created an asset, scheduled a `MAINTENANCE` block (20–22 Sept),
  confirmed it did **not** appear as a conflict for a near-term booking
  but did for an overlapping one, confirmed `Reserve` hard-blocked
  against the overlapping window with a clear conflict error and
  succeeded once the dates moved past the block (half-open boundary
  confirmed: the block's own end day was free); recorded a real deposit
  receipt (700.00 PLN, bank transfer, reference) and generated a
  `DEPOSIT_RECEIPT` document — confirmed fully Polish content
  ("Potwierdzenie przyjęcia kaucji", "Sposób płatności: Przelew
  bankowy") despite the Russian staff UI, with a working Print action;
  started and returned the rental, used the new "Send to repair" link to
  schedule a real `REPAIR` block linked back to the rental (both blocks
  then visible together on the asset); confirmed the Availability
  Calendar showed both blocked days with a wrench icon (not color alone)
  and linked correctly to the asset page. Two bugs found live during this
  walkthrough (D-105 above) were fixed and the fix re-verified live
  after rebuilding both images again.
- **Previous state (POST-CHAPTER-9 MANUAL QA FIX PASS, D-090–D-100):**
  Latest verified commit: `2cf66f8` (fix: currency race condition in
  Rental/Quote wizards, prettier formatting) — the POST-CHAPTER-9 MANUAL
  QA FIX PASS was complete. This was explicitly a bug-fix pass over
  real-browser-tested issues, **not** a new product chapter; the next
  product chapter was **not** started, per this arc's explicit hard-stop
  instruction. See D-090 through D-100 in
  [DECISIONS.md](DECISIONS.md) for full rationale on each fix.
- **What shipped (POST-CHAPTER-9 QA fix pass, D-090–D-100):** Rental tax
  is now a per-item **rate** (`RentalItem.taxRateBp`), mirroring
  `QuoteItem` exactly, replacing the old manual flat-amount entry
  (D-090). Investigated and documented — no code defect — the reported
  "Dashboard shows 0 active rentals" symptom: the canonical Active
  Rental definition is, and remains, the persisted `RentalStatus.ACTIVE`
  value only, reached via explicit `reserve()`/`start()` actions, never
  inferred from dates (D-091). Fixed the real, HIGH PRIORITY bug where a
  Commercial Offer generated directly from a Rental (no source Quote)
  rendered almost empty — enriched the `QUOTE` document template +
  resolver with `rental.subtotal/discount/tax` and
  `quote.issueDate/validUntil/terms` (D-092). Asset selectors/tables now
  show a disambiguating identifier (`name — internalNumber`) everywhere
  an asset is picked or listed. `DocumentEmailDelivery` gained a real
  `NOT_CONFIGURED` status instead of always claiming `SENT` when no real
  email provider exists (D-093). Handover/Return Protocol
  condition/damage notes are now collectible in the UI and persisted as
  real `businessData`, rendered into the generated document (D-094); the
  document checklist no longer hides Handover/Return as "not required
  yet" before they are legally preparable — Handover from `RESERVED`
  onward, Return from `ACTIVE` onward (D-095). Fixed Commercial Quote
  PDF localization — two compounding bugs: the wrong language source
  (`tenant.defaultLanguage` instead of the canonical company-country-
  first resolver) and `quote.pdf.*` i18n keys that had **never existed**
  in any locale file, so labels always fell back to English regardless
  of language (D-096). Added an explicit "Amount due at start" figure
  (total + refundable deposit) everywhere Total/Deposit were shown
  separately but never summed, and researched — but deliberately did not
  implement — a full refundable-deposit accounting/ledger model
  (D-097/D-098). Added a direct "Print" action on the Document preview
  iframe plus real `@page` A4 print CSS (D-099). Found and fixed one
  more real bug live during the required manual acceptance walkthrough
  (not from the written report): the Rental/Quote wizard's currency
  field could silently stay permanently blank when the tenant's default
  currency query resolved after the wizard's first render (D-100).
- **Verification:** full backend suite (35 files / 607 tests) and full
  frontend suite (79 files / 529 tests) green; every quality gate
  (`format`, `lint`, `typecheck`, `check:governance`,
  `test:governance-checks`) green; two new additive Prisma migrations
  (`RentalItem.taxRateBp`, `DocumentEmailStatus.NOT_CONFIGURED`) applied
  cleanly to both the dev and test databases. Docker images rebuilt from
  committed HEAD and the full acceptance scenario walked through live in
  a real browser against the rebuilt containers: created a Polish
  tenant/PLN company, a `Transport → Passenger cars / Delivery vehicles`
  category hierarchy, an asset "Skoda Fabia — SK977UG", a Rental at 50
  PLN/day × 4 days × 23% VAT (confirmed exactly 200.00 net / 46.00 VAT /
  246.00 total / 700.00 refundable deposit / 946.00 amount due at every
  surface — Rental detail, Contract, Commercial Offer, and the issued
  Invoice); generated a Rental Contract and a Commercial Offer directly
  from the Rental (confirmed fully populated, not empty); generated a
  Handover Protocol and a Return Protocol with condition/damage notes
  (confirmed all fields persisted and rendered, with Return's distinct
  "new damage"/"missing items" labels); confirmed the Dashboard's Active
  Rentals count go 0 → 1 exactly when the rental was explicitly started
  (never merely for overlapping dates); saved and issued an Invoice
  (confirmed the "Invoice saved" confirmation appears, the real
  `INV-YYYY-MM-NNNNNN` number is assigned only at issue, and the VAT
  rate is derived from the Rental item's own real rate); attempted an
  email send and a signature request (confirmed both honestly report
  "Not configured"/"Pending", never a fabricated success); confirmed
  KSeF still honestly reports "Not connected"; used the direct Print
  action (confirmed it opens the browser's native print dialog scoped
  to only the document content); and switched the UI language to
  Russian without touching the Polish company (confirmed the app chrome
  translated while every already-generated and newly-generated business
  document — Contract, Commercial Offer — stayed fully in Polish, zero
  English/Russian leakage). One real bug was found and fixed live during
  this walkthrough that was not caught by the automated suites (D-100,
  above) — the currency field race condition, only reproducible with a
  genuinely fresh tenant whose default-currency query hadn't resolved
  yet at first render.
- **What shipped:** Invoice is a standalone first-class business object
  (`Invoice`/`InvoiceItem`/`InvoiceSequence`/`Payment`/
  `InvoiceStatusHistory`), never a generic `Document` row — its own
  numbering (`InvoiceSequence`, month-scoped, `INV-YYYY-MM-NNNNNN`
  default format, real number reserved only at issue time),
  snapshot-at-issue immutability (`sellerSnapshot`/`buyerSnapshot`/
  `bankSnapshot` frozen forever once ISSUED), and its own HTML/PDF
  rendering (`invoice-renderer.service.ts`, real Polish/English
  terminology, reuses `PdfRendererService`'s Puppeteer engine — no
  second PDF engine). `CompanyBankAccount` is a structured model
  (isDefault enforcement mirrors `AssetFilesService`'s isPrimary-image
  pattern) exposed to documents via new `company.bank.*` variables in
  the existing dual document-variable registry. "Create Invoice from
  Rental" prefills customer/currency/bank account/line items, deriving
  each line's tax rate from the Rental's own already-entered effective
  rate rather than inventing one — multiple invoices per Rental are
  fully supported (`rentalId` is a plain nullable FK). `Payment` is a
  minimal append-only ledger; `PaymentsService` derives
  PARTIALLY_PAID/PAID live from summed payments, never inferred at
  creation; OVERDUE derives lazily on read (mirrors
  `QuotesService.applyExpiryIfDue`). A country-neutral
  `EInvoiceProvider` interface + `KsefProvider` stub backs Settings ->
  Integrations (shown only for Poland-country tenants) — `testConnection`
  always reports an honest not-implemented state, `submitInvoice`/
  `checkSubmissionStatus` throw `NotImplementedException`; **no real
  KSeF API call exists anywhere in this codebase**, per the task's
  explicit "do not fake a working KSeF connection" constraint. A new
  `EncryptionService` (AES-256-GCM, `KSEF_ENCRYPTION_KEY`) is the
  codebase's first reversible-encryption primitive, protecting stored
  provider credentials. ACCOUNTANT's permission set was deliberately
  widened from fully-read-only to real invoice/payment operational
  control (D-089). Full frontend: Rental Workspace Invoices card, global
  Invoices module, invoice create/detail pages, Company Profile Banking
  settings, Settings -> Integrations. All 14 locales translated and
  parity-verified (including real Polish invoice terminology). See
  D-081 through D-089 in [DECISIONS.md](DECISIONS.md) for full
  rationale on each design decision.
- **Verification:** full backend suite (36 files / 600 tests) and full
  frontend suite (78 files / 516 tests) green; every quality gate
  (`format`, `lint`, `typecheck`, `build`, `check:governance`) green;
  Docker images rebuilt from scratch and all three acceptance scenarios
  from the task walked through live in a real browser against the
  rebuilt containers: (1) a Poland-country tenant with a complete
  Company Profile + PLN bank account (IBAN/SWIFT) creates an Invoice
  from a Rental Workspace (800 PLN, 23% VAT) — customer/company/rental/
  items/tax/totals/bank-account all correctly prefilled, the document
  language resolves to Polish independent of the staff user's Russian
  UI, and the downloaded PDF's extracted text confirms real Polish
  terminology (FAKTURA, Numer faktury, Sprzedawca, Nabywca, ...) with no
  English leakage; issuing immediately shows the invoice back on the
  same Rental; (2) a 1,000 PLN invoice receives a 400 PLN payment
  (status -> PARTIALLY_PAID, remaining 600.00 PLN exactly) then the
  remaining 600 PLN (status -> PAID, remaining 0.00 PLN exactly); (3) a
  second, independent invoice (a 184.50 PLN late-return-fee line) is
  created for the same Rental already carrying its first invoice — both
  remain independently listed and accessible, proving no
  one-invoice-per-Rental assumption exists anywhere. Two real bugs were
  found and fixed live during this verification pass (not present in
  the unit/e2e suites, which don't exercise the built Docker image's
  bundled translations or a >100-row customer query): a `pageSize: 200`
  customer-list request exceeding the API's `@Max(100)` cap silently
  emptied the invoice-editor customer dropdown, and three dialog buttons
  referenced `common.save`/`common.edit`/`common.remove` i18n keys that
  never existed in the shared `common.*` namespace (fixed by adding all
  three, in all 14 locales).
- **Previous state (Pre-Chapter 10 — Rental Workflow, Contract System &
  No-Code Document Template Builder, D-060–D-065):**
  Latest verified commit: `9dea605` (fix: skip redundant registry
  policy re-check in Docker image installs, D-065) — Pre-Chapter 10
  Rental Workflow, Contract System & No-Code Document Template Builder
  (D-060–D-065) is complete and CI-green. Chapter 10
  itself was **not** started, per the arc's explicit hard-stop
  instruction. Every commit in this arc pushed to `main` individually
  and was confirmed CI-green before the next was started (no batched,
  unverified pushes); the arc sits on top of `591ee4e` (docs: record
  globalization foundation decisions) — Pre-Chapter 10 Globalization &
  Internationalization Foundation (D-057).
- **What shipped (Pre-Chapter 10 — Rental Workflow, Contract System &
  No-Code Document Template Builder, D-060–D-064):** two combined
  specs completed incrementally (implement → test → verify →
  commit/push → confirm CI → continue), each subtask CI-verified before
  the next began. **Part A (D-060):** fixed the real blank-contract bug
  — every generated Document had `rentalId: null` because the
  "Generate document" flow had no rental picker, even though the
  backend already supported linking one; added "Generate Contract"/
  "Generate document" actions on the Rental/Quote Workspaces with
  pre-filled `rentalId`/`quoteId`/`documentType`/`employeeUserId`.
  **Part D (D-061):** `DocumentVersion.templateVersionId` pins each
  version to the template content active at creation time, fixing a
  real immutability gap where editing an ACTIVE template silently
  changed how an already-SIGNED document re-rendered. **Part E
  (D-062):** `DocumentTemplate.language` + per-`(tenant, documentType,
language)` active-template uniqueness closes the document-language
  gap D-057 explicitly left open. **Parts B/C (D-063):** Tenant
  company-identity fields + Company Profile settings page; `DatePicker`/
  `TimePicker`/`DateTimeField` (`packages/ui`) replacing raw
  `datetime-local` inputs in the Rental/Quote wizards; tenant-timezone
  threaded through every Rental/Quote date **display** site; new
  time-aware/multi-asset-table resolver variables
  (`rental.startDateTime`, `rental.assetsTableHtml`,
  `quote.servicesTableHtml`, `rental.deposit`); the default Rental
  Contract template rewritten to all 18 requested sections. **Parts E/F
  (D-064, the largest piece):** a Tiptap/ProseMirror-based no-code
  document template builder
  (`apps/web/src/components/documents/template-builder/`) — insert-
  field chips driven by a new parity-checked `document-variable-
registry.ts`, an 18-section `contract-section-library.ts` ("Add
  section"), move-up/down/remove block reordering, `renderBlocksToHtml()`
  compiling to the exact same `{{dot.path}}` HTML string
  `DocumentRendererService` already renders (zero backend rendering
  changes), a Visual/Advanced mode toggle with backward-compatible
  Advanced-only fallback for legacy templates, a
  `POST .../document-templates/preview` endpoint rendering unsaved
  drafts against synthetic sample data, a "Start from Havelio Rental
  Contract template" starter, and pure `getRentalNextAction()`/
  `getQuoteNextAction()` utilities surfaced as each Workspace's
  `PageHeader` primary action. Testing caught and fixed one real bug
  before it shipped (a ProseMirror section-nesting bug in "Add
  section"). All 14 locales translated and parity-verified throughout;
  full backend/frontend test suites green after every commit (verified
  via CI throughout the arc, since Docker Desktop was down on the
  development machine at the time). **Follow-up (D-065):** with Docker
  Desktop back up, attempted the plan's final
  Docker-image-rebuild + manual-browser-walkthrough step; the image
  build itself was blocked for several hours by severe registry-network
  degradation on this specific host (confirmed via direct latency
  tests: normal sub-second `registry.npmjs.org` requests took 7-20s+,
  both from the host and from inside a container, for the duration of
  this session) — not a Docker-availability or code problem. Found and
  fixed one genuine, unrelated build-performance issue in the process
  (`--trust-lockfile`, D-065) but the raw package-download layer itself
  never completed even after 4 full rebuild attempts and two different
  pnpm-flag mitigations. As a substitute, ran the full backend suite
  (`vitest`, unit + e2e, 31 files / 509 tests) locally against the
  already-running Postgres/Redis containers, and the full frontend
  suite (73 files / 442 tests) — both green — plus every quality gate
  (`format`, `lint`, `typecheck`, `build`, `check:governance`) locally.
  **The literal Docker-image rebuild + manual browser click-through has
  still NOT been performed** and remains an open item — retry once
  registry connectivity from this host recovers; nothing about this gap
  is specific to the arc's own code (CI, which builds on GitHub-hosted
  runners, is unaffected by this local network condition). See D-060
  through D-065 for full per-part decision records.
- **Previous state (Pre-Chapter 10 — Globalization Foundation, D-057):**
  explicit HARD STOP before Chapter 10 to harden Havelio's global
  readiness rather than add a new feature. Consolidated all locale
  metadata (code/englishName/nativeName/direction) into one
  `localeRegistry` in `packages/localization/src/index.ts`, replacing a
  hardcoded array duplicated in `user-menu.tsx`. Expanded shipped UI
  locales from 6 to **14** (`en/pl/de/uk/ru/es` + new `fr/it/pt-BR/nl/
cs/zh-CN/ja/ko`) with real, natural translations across all 16
  namespaces — key-structure parity verified
  (`scripts/check-i18n-parity.mjs`, unmodified, auto-discovers locale
  folders). Added `apps/web/src/lib/date-format.ts`
  (`formatDate`/`formatDateTime`/`formatMonthYear`, `Intl`-based,
  explicit `locale` param) and gave `formatMoney()` an optional
  `locale` param, then replaced ~20 remaining `.toLocaleDateString()`/
  `.toLocaleString()` call sites app-wide with locale-aware equivalents.
  Wired the real (previously-dead) `Tenant.timezone` column into
  `quote-pdf.service.ts`/`variable-resolver.service.ts`'s date
  formatting in place of hardcoded `"UTC"`. Extended
  `useLanguagePreference()` to sync `document.documentElement.dir` from
  the registry's `direction` field alongside `lang`, proving the RTL
  pipeline end-to-end (all 14 shipped locales remain `ltr` — no
  Arabic/Hebrew added). Registration's `defaultLanguage` field is now a
  real `<select>` sourced from the registry with client+server
  validation, replacing a free-text input. Added a
  `formatDate`/`localeRegistry`/`i18next`-fallback/`useLanguagePreference`
  test suite (5 new files, 30 tests) plus a representative-Unicode
  customer-search e2e test (French accents, Polish diacritics,
  Ukrainian Cyrillic, German umlauts, CJK). Audited and confirmed
  already-sound without code changes: the font stack (Inter +
  `ui-sans-serif`/`system-ui`/`-apple-system` fallback already renders
  CJK via standard per-glyph browser fallback — no Noto Sans CJK
  bundled, deliberately), address/VAT/postal fields (already free-text,
  no country-specific format assumptions), and Unicode substring search
  (Postgres `ILIKE` via Prisma `contains`+`mode:"insensitive"`).
  Document/DocumentTemplate rendering language was, at the time,
  coupled to `tenant.defaultLanguage` — audited and deliberately left
  as a documented gap (D-057) rather than a narrow field that wouldn't
  actually deliver a translated contract. **This gap is now closed by
  D-062** (`DocumentTemplate.language` + per-language active-template
  uniqueness), part of the Pre-Chapter 10 arc described above. See
  D-057 and D-062 for the full decision records.
- **Previous chapter — what shipped (Chapter 9):** a Documents & Contracts Workspace
  built entirely on existing platform-document infrastructure — no
  second document system, no Invoice type, no real e-signature/SMTP.
  Two additive backend extensions (D-054): `AssetsService.findOne()`
  and `CustomersService.findOne()` now include `platformDocuments`/
  `documents`, real, existing `Document.assetId`/`Document.customerId`
  relations never surfaced before — no new endpoint, no migration. A
  new `<DocumentStatusBadge>` mirrors `RentalStatusBadge`/
  `QuoteStatusBadge` exactly, giving every document status a real
  color everywhere it appears. A new, pure
  `getRentalDocumentChecklist()` derives a 4-item checklist (commercial
  offer/rental contract/handover protocol/return protocol) from a
  Rental's real `sourceQuote`/`documents`/`status` fields — never a new
  persisted state, and `commercialOffer` deliberately never reads
  "missing" (a direct-created rental with no source quote is a
  legitimate workflow, not a defect). The Documents list gained a
  Smart Summary (Total/Draft/Sent/Signed) via `useDocumentsSummary()`,
  composed from the existing list endpoint's `.total` using the same
  `pageSize:1` technique `use-dashboard-stats.ts` established in
  Chapter 4, rather than a new aggregation endpoint. The Document
  detail page gained a Related Records card (Customer/Rental/Quote/
  Asset, each a real link, only rendered when the relation exists).
  Asset and Customer detail pages each gained a Documents card for the
  first time. See `UI_REDESIGN_PLAN.md` Chapter 9 for the full design
  rationale, including every documented gap (no Invoice document type
  — zero `Invoice`/`Payment`/`Transaction` model in the schema; no real
  e-signature — `LocalMockSignatureProvider` remains the only
  implementation; no real SMTP — `LoggingEmailProvider` remains bound;
  no template designer/drag-and-drop editor). While verifying Chapter
  9's own mobile (375px) responsive requirement, a pre-existing bug was
  found and fixed in the shared `<DataTable>` mobile-card renderer
  (D-055): it silently rendered `[object Object]` for any
  `mobileRole:"secondary"` column whose `cell` returned a React element
  (a status badge) instead of a string, via
  `.map(...).join(" · ")`-ing React nodes. This also silently affected
  the pre-existing Rentals and Quotes mobile cards — fixed once for all
  three, full frontend suite re-verified green (365/365).
- **Previous chapter — what shipped (Chapter 8):** the Quote detail page rebuilt from a
  plain CRUD form into an operational Quote Workspace, mirroring
  Chapter 7's Rental Workspace shape wherever the underlying domain
  concept is structurally the same. One additive backend change —
  `QUOTE_DETAIL_INCLUDE` now includes `platformDocuments`, a real,
  existing `Quote.platformDocuments` relation `findOneRaw()` never
  surfaced before (D-053) — no new endpoint, no new permission, no
  migration. A centralized, pure `getQuoteValidityIntelligence()`
  derives a closed set of validity labels (`expires_in_days`/
  `expires_today`/`expired`/`accepted`/etc.) from status + `validUntil`,
  never a persisted value; a single `<QuoteStatusBadge>` reused by both
  the Workspace and the quotes list page gives quote status a real
  color for the first time, using only existing semantic tokens
  (D-053). The Workspace now shows: a Customer card (name/company/
  phone/email, linked); a Smart Summary (quote value/deposit/items
  count/validity status); an enhanced items table (discount/tax
  columns, asset links); a consolidated Documents card (converted
  Rental link + linked platform Documents, each a real link, with an
  honest empty state — never fabricated). Verified end-to-end with real
  data: created a customer, an asset category, an asset, a Quote with a
  real DAILY-billed asset line, sent it, accepted it, and converted it
  to a Rental — the resulting Rental's `sourceQuote` link and the
  Quote's `convertedRental` link both render correctly, and a genuine
  availability warning appeared (the just-created Rental reserves the
  same asset for the same dates), confirming the warning logic reads
  real state rather than fabricated data. Two product gaps were
  evaluated and explicitly documented rather than built: the Customer
  Portal has zero quote exposure today (the public-token link and the
  portal's authenticated-session model are structurally different, not
  conflated), and no new "Send" UI was needed since the existing
  Send button + `EmailService`/`LoggingEmailProvider` infrastructure
  already satisfies the chapter's Email/Send-Readiness requirement
  honestly. See `UI_REDESIGN_PLAN.md` Chapter 8 for the full design
  rationale, including every documented gap (no accounting/payment/
  invoicing/e-signature/AI-generation/property-management subsystem —
  nothing in the schema or this chapter's brief supports any of them).
- **Previous chapter — what shipped (Chapter 7):** the Rental detail page rebuilt from a
  plain CRUD form into an operational workspace. One additive backend
  change — `RENTAL_DETAIL_INCLUDE` now includes `sourceQuote` and
  `documents`, both real, existing Prisma relations `findOne()` never
  surfaced before (D-051) — no new endpoint, no new permission, no
  migration. A centralized, pure `getRentalTimeIntelligence()` derives
  a closed set of date-relative labels (`starts_in_days`/
  `days_remaining`/`overdue`/etc.) from status + planned dates, never a
  persisted value; a single `<RentalStatusBadge>` reused by both the
  Workspace and the rentals list page gives status a real color for
  the first time anywhere in the product, using only existing semantic
  tokens (D-052). The Workspace now shows: a Customer card (name/
  company/phone/email, linked); an enhanced Assets card (asset link,
  the asset's own status, computed price via the existing
  `estimateItemLineTotalMinor` pricing mirror); a consolidated
  Documents card (source Quote + linked Documents, each a real link,
  with an honest empty state — never fabricated); the unchanged
  Chapter 6 Timeline sidebar. See `UI_REDESIGN_PLAN.md` Chapter 7 for
  the full design rationale, including every documented gap (no
  payment/invoice UI, no new "Send" button, no new keyboard shortcut,
  no calendar view, no property-management fork — nothing in the
  schema or this chapter's brief supports any of them).
- **Quality gates (Chapter 9):** format/lint/typecheck/build green
  across all 6 packages; 479 backend + 365 frontend tests passing (844
  total), including 4 new backend tests (`platformDocuments`/
  `documents` inclusion reflecting real `Document.assetId`/
  `Document.customerId` links, and exclusion of soft-deleted ones) and
  37 new frontend tests (`<DocumentStatusBadge>` per-status tone,
  `document-completeness-intelligence.ts` covering every checklist
  state across all relevant `RentalStatus` values, the Documents
  Workspace Smart Summary, the Document detail page's Related Records
  card, and the Asset/Customer Documents cards). i18n key-parity (6
  locales, identical structure), permission-registry sync (49
  permissions, 6 roles), and doc-link checks (266 links, 31 files) all
  passed.
- **Docker/browser verification (Chapter 9):** the `web` and `api`
  images were rebuilt and redeployed into the running Docker Compose
  stack. Verified with a real tenant/customer/asset-category/asset/
  quote created live through the UI, sent, accepted, and converted to
  a Rental (re-confirming Quote→Rental conversion still works): the
  resulting Rental's new Document Checklist card correctly showed
  Commercial offer=Linked, Rental contract=Missing, Handover/Return
  protocol=Not required yet for the freshly-`RESERVED` rental. A real
  `CONTRACT`-type Document was then created and linked to the customer
  and asset (not the rental), exercising its full real lifecycle
  (Draft→Ready→Sent→Signed) — the Documents Workspace Smart Summary
  correctly updated its Draft/Sent/Signed counts at each transition;
  the Asset and Customer detail pages' new Documents cards both showed
  the real linked document; the Document detail page's new Related
  Records card showed real, correctly-linked Customer and Asset
  entries; the Rental's checklist still correctly showed Rental
  contract=Missing afterward, since the real document was linked to
  Customer/Asset, not that Rental — confirming the checklist derives
  strictly from real `rental.documents`, never fabricated completion.
  The Document detail page rendered a real generated HTML preview
  (company/parties/asset table, genuine data, not a placeholder). Dark
  mode and mobile (375px) both verified on the Rental Workspace and
  Documents Workspace with no horizontal overflow; German and
  Ukrainian localization spot-checked live on the new elements
  ("Mietvertrag"/"Unterschrieben"/"Verknüpfte Datensätze" in German;
  "Договір оренди"/"Підписано"/"Пов'язані записи" in Ukrainian — all
  genuinely translated, no leftover English); no console errors. A
  genuine pre-existing bug (D-055) was found live during this mobile
  pass — the shared `<DataTable>` mobile card silently rendered
  `[object Object]` for any status-badge column — fixed, and the fix
  was re-verified live on the Documents, Rentals, and Quotes mobile
  cards, all now showing their real colored status badge.
- **GitHub Actions (Chapter 9):** confirmed green. Run #35 (commit
  `457585f`, the feat/test/docs commits) failed on a `hookTimeout`
  inside `rental-numbering.e2e-spec.ts`'s heaviest concurrency test
  (25 simultaneous requests), which then raced the next test's
  `cleanDatabase()` against an in-flight write — a CI-runner
  contention flake, not a Chapter 9 regression (that spec touches no
  file Chapter 9 changed, and passed 4/4 local runs unmodified). D-056
  raised the e2e `hookTimeout`/`testTimeout` from 20s to 40s in a
  follow-up commit (`7caa4e8`); run #36 then `completed successfully`.
- **Previous chapter's quality gates/verification (Chapter 8):**
  format/lint/typecheck/build green across all 6 packages; 477 backend
  - 328 frontend tests passing (805 total). Docker/browser
    verification: the Workspace's header showed the colored status badge
    and a real validity chip ("Expires in 6 days" → "Accepted" →
    "Converted" as status changed); the Smart Summary showed real
    quote-value/deposit/items-count/validity-status numbers (no fabricated
    data); the Documents card transitioned from an honest empty state to
    showing the real converted-rental link once conversion completed; a
    genuine availability warning appeared on the now-Converted quote
    since the resulting Rental reserves the same asset for the same
    dates. Dark mode and German localization both spot-checked correctly;
    mobile (375px) verified with no horizontal overflow. This chapter's
    commits were later pushed and confirmed green on CI.
- **Previous chapter's quality gates/verification (Chapter 7):**
  format/lint/typecheck/build green across all 6 packages; 476 backend
  - 303 frontend tests passing (779 total), including 2 new backend
    tests (`sourceQuote`/`documents` inclusion on a direct rental and on
    a quote-converted rental) and 15 new frontend tests
    (`rental-time-intelligence.ts` covering every derived label,
    `<RentalStatusBadge>`'s per-status tone, and the rebuilt Workspace's
    Customer/Assets/Documents/Summary sections). Docker/browser
    verification: the Workspace's header showed the colored status badge
    and a real time-intelligence chip ("Starts in 3 days"); the Documents
    card rendered the honest empty state for a rental with no linked
    documents/quote, confirmed via `GET /rentals/:id`'s raw JSON response
    (`sourceQuote: null, documents: []`); dark mode and German
    localization both spot-checked correctly; no console errors, no
    horizontal overflow at 375px. This chapter's commits (`12c0567`,
    `82bb810`) were later pushed and confirmed green on CI, recorded in
    `8960a17`.

> Update-in-place marker: the "Latest verified state" section above must
> be the first thing updated when a task pushes new green CI. Do not let
> this drift — a wrong commit hash here is worse than no hash at all.

## Repository purpose

RentOS is a multi-tenant SaaS "Rental Operating System" — see
[VISION.md](VISION.md) for the full product framing. This file is the
practical, technical resume-work reference;
[PRODUCT_BIBLE.md](PRODUCT_BIBLE.md) explains the product philosophy
and decision framework, VISION/ROADMAP explain _why_ and _what's
next_, PRODUCT_PRINCIPLES explains _how we decide_, this file explains
_how the code is actually laid out and how to work in it_.

## Technology stack

| Layer    | Choices                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend | Next.js (App Router), React, TypeScript, TailwindCSS v4, shadcn/ui (`@rentos/ui`), TanStack Query, React Hook Form, Zod, i18next             |
| Backend  | NestJS, TypeScript (strict), Prisma ORM, PostgreSQL, Redis, Argon2id password hashing, JWT (access + rotating refresh tokens)                |
| Infra    | Docker, Docker Compose, GitHub Actions CI, Turborepo, pnpm workspaces                                                                        |
| PDF      | `pdfkit` (chosen over headless-browser PDF generation for Docker/CI reliability), `dejavu-fonts-ttf` for embedded Unicode (Cyrillic) support |

Node.js >= 20 required (`package.json` `engines`); pnpm is the package
manager (`packageManager: pnpm@11.17.0`).

## Monorepo / workspace structure

```
apps/
  api/        NestJS backend
  web/        Next.js frontend
packages/
  config/     Shared tsconfig/build config
  shared/     Shared TypeScript types/env schema (apiEnvSchema, etc.)
  ui/         shadcn/ui component library (@rentos/ui)
  localization/  i18next resources — src/locales/{en,ru,uk,de,pl,es}/common.json
docker/
  docker-compose.yml   full stack: postgres, redis, api, web
docs/         this documentation set
.github/workflows/ci.yml   CI pipeline (see below)
```

Turborepo orchestrates `build`/`lint`/`typecheck`/`test` across all
packages via `turbo.json`'s task graph (typecheck depends on `^build`,
not `^typecheck` — a deliberate fix, see commit `6b739f1`).

## Application architecture

- **API-first**: the web app talks to the API purely over REST
  (documented in [api.md](api.md)); there is no server-side-only
  capability hidden from that surface.
- **Multi-tenant, single-database**: one Postgres database, every
  tenant-scoped table carries a `tenantId` column, every query is scoped
  by it server-side. No schema-per-tenant or database-per-tenant.
- **NestJS module-per-domain**: `auth`, `tenants`, `customers`, `assets`
  (+ `asset-categories`, `asset-statuses`, `asset-custom-fields`,
  `asset-files`), `rentals`, `rental-billing-settings`, `quotes`,
  `documents`, `customer-portal` (its own, fully separate auth stack — see
  ADR 0012), `email`, `permissions`, `audit`, `storage`, `prisma`, `health`.

## Backend structure (`apps/api/src`)

Each domain module follows the same shape:

```
<domain>/
  <domain>.module.ts       NestJS module: imports/providers/controllers/exports
  <domain>.controller.ts   @Controller("tenants/:tenantId/<domain>") + guards
  <domain>.service.ts      business logic, Prisma access, transactions
  <domain>.types.ts        Prisma include consts + view/response types
  dto/                     class-validator DTOs for request bodies
  *.spec.ts                colocated unit tests (pure functions/services)
```

Cross-cutting modules: `permissions/` (the `Permission` union type,
`ROLE_PERMISSIONS` map, `PermissionsGuard`, `@RequirePermissions(...)`
decorator — **controllers never check `MembershipRole` names directly**),
`audit/` (`AuditService.log(input, tx?)` — accepts an optional
transaction client so an audit row commits atomically with the action it
records), `tenants/` (`TenantGuard`, `CurrentTenant()` decorator —
re-verifies active membership against the database on every request).

Global guards: `JwtAuthGuard` (applied globally, `@Public()` escapes it
for register/login/refresh and the public quote endpoints).

## Frontend structure (`apps/web/src`)

```
app/
  app/                 authenticated app shell (layout.tsx has the nav)
    customers/ assets/ rentals/ quotes/ settings/...
  login/ register/    public auth pages
  quote/[token]/       public, token-authenticated quote acceptance page
components/<domain>/  wizards and row components (RentalWizard, QuoteWizard, QuoteItemRow, ...)
hooks/use-<domain>.ts  TanStack Query hooks (queries + mutations, cache invalidation on mutation success)
lib/
  api-client.ts        fetch wrapper, credentials:"include", ApiError class
  <domain>-pricing.ts  client-side pricing *estimate* mirrors — NEVER trusted, API recomputes authoritatively
  validation.ts        all Zod schemas, one object per form
  permissions.ts       mirrors apps/api/src/permissions/permission.ts exactly (UX convenience only, not a security boundary)
  i18n.ts              i18next init, imports `resources` from @rentos/localization
types/<domain>.ts       hand-written TS types mirroring API response shapes
```

Wizard pattern (Rentals, Quotes): a `STEPS` tuple, `useState` step index,
React Hook Form for scalar fields + a plain `useState` array for line
items, per-step `trigger()` validation, a live pricing estimate computed
from the client-side pricing-mirror lib.

## Database and Prisma structure

Single `apps/api/prisma/schema.prisma`, migrations in
`apps/api/prisma/migrations/`. Conventions (non-negotiable, apply to
every new model):

- `id String @id @default(uuid())` — client-generated UUID, never a
  DB-generated serial/identity column.
- Every tenant-scoped model has `tenantId String` with
  `@relation(fields: [tenantId], references: [id], onDelete: Cascade)`.
- Soft delete via nullable `deletedAt DateTime?` — never a hard delete
  for anything with operational/financial history.
- Money: always `Int` in integer minor currency units, paired with a
  `String @db.VarChar(3)` ISO 4217 currency code. Never `Float`, never
  `Decimal`.
- Percentages/rates: integer basis points (`taxRateBp`, discount
  `discountValue` when `discountType=PERCENTAGE`), e.g. `1000` = 10.00%.
- Append-only history tables (`*StatusHistory`) — never updated, only
  inserted, written inside the same transaction as the status change
  they record.
- `@@map("snake_case_table_name")` on every model (Prisma model names are
  PascalCase, actual table names are snake_case).

Migrations are generated non-interactively in this environment via
`prisma migrate diff --from-url ... --to-schema-datamodel ... --script`
(an `npx prisma migrate dev` prompt cannot run non-interactively here),
then hand-placed into a timestamped migration folder and applied with
`prisma migrate deploy`. See "Migration workflow" below for the exact
commands.

## Authentication flow

Email/password registration creates a `User` + a new `Tenant` + an
`OWNER` `TenantMembership` atomically in one transaction (rollback
verified by a dedicated test, `auth-rollback.e2e-spec.ts`). Login issues
a short-lived JWT access token + a longer-lived rotating refresh token,
both in `httpOnly` cookies (`rentos_access_token`, `rentos_refresh_token`)
— **never `localStorage`**. Refresh rotates the token (old one revoked,
new one issued). See [ADR 0001](adr/0001-authentication-and-tenant-context.md).

## Tenant isolation approach

Every tenant-scoped controller route is `/tenants/:tenantId/...` and
carries `@UseGuards(TenantGuard, PermissionsGuard)`. `TenantGuard` reads
`:tenantId` from the URL, verifies the current user has an `ACTIVE`
`TenantMembership` in that exact tenant (a fresh DB query every request,
never cached/trusted from a JWT claim), and populates
`CurrentTenant()`/`CurrentUser()` for the handler. A tampered or
cross-tenant ID in the URL is rejected with `403`, verified by dedicated
e2e tests in every module (`rejects cross-tenant ... access`).

## RBAC / permissions approach

Six roles: `OWNER`, `ADMIN`, `MANAGER`, `ACCOUNTANT`, `TECHNICIAN`,
`VIEWER`. `apps/api/src/permissions/permission.ts` defines every granular
`Permission` string (`"<resource>.<verb>"`, e.g. `"rentals.reserve"`,
`"rental_settings.manage"`) and the default `ROLE_PERMISSIONS` map.
`PermissionsGuard` + `@RequirePermissions("some.permission")` on each
controller handler is the _only_ authorization mechanism — grep the
codebase for `MembershipRole ===` inside a controller and you should find
nothing. `apps/web/src/lib/permissions.ts` mirrors the exact same map for
UX purposes (hiding/disabling controls a user can't use) — it is
explicitly documented as **not** a security boundary; the API
independently re-checks every permission server-side regardless of what
the UI shows.

## Audit conventions

`AuditService.log({ tenantId, userId, action, entityType, entityId,
metadata? }, tx?)`. Action names are `"<entity>.<verb>"` (e.g.
`"rental.created"`, `"quote.status_changed"`,
`"rental_billing_settings.updated"`). Written inside the same
`$transaction` as the action it records wherever the action itself is
transactional. Metadata never contains secrets/tokens/password hashes —
grep any new audit call for accidental inclusion of a hashed token or
similar before merging.

## Localization architecture

`packages/localization/src/locales/<lang>/common.json`, one flat-ish
nested JSON per language, identical key structure verified across all
six languages for every module (`en`, `ru`, `uk`, `de`, `pl`, `es`).
`packages/localization/src/index.ts` exports `resources` (i18next
resource bundle) — **note**: this package must be rebuilt
(`pnpm --filter @rentos/localization build`) after editing any
`common.json`, both for the web app to pick up new keys in dev/test and
because `apps/api` (a plain Node ESM consumer, unlike the
webpack-bundled web app) requires the compiled `dist/locales` output and
`with { type: "json" }` import attributes on every JSON import (a real
bug hit and fixed during TASK-0007 — see ADR 0007's known-limitations
history if curious). Error messages in Zod schemas are **i18n key
strings**, not display text — form components translate them via
`t(errors.field.message)`.

## Date and timezone conventions

All calendar-month arithmetic uses UTC fields explicitly
(`date.getUTCMonth()`, `Date.UTC(...)`) — **never** the host process's
local timezone. Adding N calendar months clamps the day-of-month to the
target month's actual length (Jan 31 + 1 month = Feb 28 or 29; Aug 31 + 1
month = Sep 30). A rental/quote's `plannedEnd` must be strictly after
`plannedStart` (validated server-side); durations round up any partial
day to a full billable day (`durationInDays`, never returns 0 for a valid
range). See [ADR 0008](adr/0008-configurable-monthly-billing-strategies.md)
for the full date-boundary convention.

## Money and minor-unit conventions

Every amount is an integer in minor currency units (cents), paired with
an ISO 4217 currency code. Percentages are integer basis points. Exactly
one `Math.round()` per computation step, never chained. No `Decimal`
library is used anywhere in this codebase — deliberately; see ADR 0002's
and ADR 0007's "decimal-safe arithmetic" sections for why integer
arithmetic was chosen over a Decimal type.

## Pricing architecture

`apps/api/src/rentals/rental-pricing.util.ts` is the canonical pricing
engine: `durationInDays`, `addCalendarMonthsUtc`, `monthsInRange` (legacy
whole-month rounding, still used as-is by Quotes' non-tenant-configurable
callers where applicable), `computeMonthlyBreakdown` (the
strategy-based complete-units-plus-remainder split — see below),
`computeItemLineTotalMinor`, `computeRentalTotals`. Quotes' own
`apps/api/src/quotes/quote-pricing.util.ts` imports the shared date/month
primitives from this file rather than reimplementing them — **this is
the established pattern for any future module that needs duration- or
calendar-month-based pricing**: extend `rental-pricing.util.ts`, import
from it, do not fork it.

## Monthly billing strategies

Three tenant-configurable strategies for `MONTHLY`-billed line items
(Rentals and, after this stabilization task, Quotes — both read the same
tenant-wide setting):

- `CALENDAR_MONTH` (default) — real calendar-month arithmetic; a period
  splits into complete calendar months plus a daily-priced remainder
  (e.g. Jan 15 → Mar 20 = 2 months + 5 days).
- `FIXED_30_DAYS` — every complete 30 billable days is one unit.
- `CUSTOM` — every complete tenant-defined `customMonthLengthDays`
  (1–365) billable days is one unit.

Configured per tenant via `RentalBillingSettings` (one optional row per
tenant — a missing row means the tenant has never customized this and
defaults to `CALENDAR_MONTH`, so no data migration was needed when this
model was introduced). Exposed via
`GET/PATCH /tenants/:tenantId/rental-billing-settings`, gated by
`rental_settings.view`/`rental_settings.manage`. See
[ADR 0008](adr/0008-configurable-monthly-billing-strategies.md).

## Historical-price snapshot rules

A `MONTHLY`-billed line item (on a Rental or a Quote) **freezes** the
strategy it was priced under at write time (`monthlyBillingStrategy` +
`customMonthLengthDays`, stored on the item row itself, nullable/null
unless the item is `MONTHLY`). A later change to the tenant's
`RentalBillingSettings` **never** alters an already-created item's stored
total — the frozen fields, combined with the parent Rental/Quote's own
`plannedStart`/`plannedEnd`, are enough to reproduce the exact original
calculation on demand via the same pure `computeMonthlyBreakdown`
function. Only an _explicit_ full item-list replacement (the user
resubmitting `items` on a `PATCH`) re-reads the tenant's _current_
settings; an edit that leaves items untouched (e.g. just `notes` or
`discountMinor`) always keeps every item's already-frozen strategy.

## Rental lifecycle

`DRAFT → QUOTE → RESERVED → ACTIVE → RETURNED → COMPLETED`, with
`CANCELLED` reachable from any non-terminal state. Items and planned
dates are editable only in `DRAFT`/`QUOTE`; immutable once `RESERVED`.
Every transition writes a `RentalStatusHistory` row in the same
transaction as the status change. The availability engine
(`AvailabilityService`) queries `RentalItem` rows whose parent
`Rental.status` is `RESERVED` or `ACTIVE` directly — never a cached
status field — using a half-open interval overlap check (back-to-back
same-day bookings allowed). See
[ADR 0006](adr/0006-rental-lifecycle-and-availability.md).

## Quote lifecycle

`DRAFT → SENT → VIEWED → ACCEPTED → CONVERTED`, with
`REJECTED`/`EXPIRED` reachable from `SENT`/`VIEWED` and `CANCELLED`
reachable from `DRAFT`/`SENT`. Commercial fields (customer, dates,
currency, discount, items) are editable only while `DRAFT` — once `SENT`
or later, duplicate the quote instead of mutating it (no revision-chain
model; see ADR 0007). Expiry is evaluated lazily (on next read/action
against a `SENT`/`VIEWED` quote past `validUntil`), not via a scheduled
job. Conversion to a Rental is idempotent (repeat calls on an
already-`CONVERTED` quote return the same Rental) and copies only
`ASSET`-type `QuoteItem`s into `RentalItem` rows; the Rental's totals are
copied verbatim from the Quote's own authoritative totals, never
recomputed from just the asset items.

## Document Management Platform (TASK-0008 Parts 1–2)

`apps/api/src/documents/` — a generic `Document` model (tagged by
`DocumentType`: `CONTRACT`/`HANDOVER_PROTOCOL`/`RETURN_PROTOCOL`/
`DAMAGE_REPORT`/`CONTRACT_AMENDMENT`/`CUSTOM`, plus a reserved, unused
`QUOTE` value) covering every document type with no type-specific
columns — type-specific content lives entirely in untyped JSON
(`DocumentVersion.businessDataSnapshot`, `DocumentItem.dataJson`). See
[ADR 0010](adr/0010-document-management-platform.md) (Part 1) and
[ADR 0011](adr/0011-document-rendering-and-sharing.md) (Part 2) for the
full rationale; this section is the short practical summary.

**Versioning/immutability**: a `DocumentVersion` is mutable only while its
document is `DRAFT`; leaving `DRAFT` (`POST .../ready`) finalizes it
forever (`isFinal`, `finalizedAt`). A later correction
(`POST .../versions`, `reason` required) creates a new parent-linked
version and resets the document to `DRAFT`. This is genuinely new
architecture in this codebase — Rentals/Quotes only freeze pricing at the
_item_ level (ADR 0008/0009), never the whole record.

**Lifecycle**: `DRAFT → READY → SENT → (VIEWED →)
PARTIALLY_SIGNED/SIGNED/REJECTED → ARCHIVED`, `VOIDED` from any
non-terminal state. `VIEWED` is optional, not a mandatory gate before
signing/rejecting. No real e-signature integration exists —
`sign`/`reject`/`viewed` only record a staff-asserted outcome, same
"logging placeholder now, real provider later" shape as `EmailProvider`.

**Numbering**: `document-numbering.util.ts` mirrors
`quote-numbering.util.ts`/`rental-numbering.util.ts`'s atomic upsert
exactly — one counter per `(tenantId, documentType, year)`, non-year-
scoped for named types (`CON-######`, `HD-######`, `RT-######`,
`DMG-######`, `AMD-######`), year-scoped only for `CUSTOM`
(`DOC-2026-######`). `year` uses a `0` sentinel, never `NULL`, for
non-year-scoped types — see D-024 in DECISIONS.md for why.

**Storage**: `DocumentFile` reuses `StorageService` as-is (ADR 0005) —
no new storage code. `format` is `PDF`/`HTML`/`JSON_SNAPSHOT` (reserved,
nothing generates these yet) or `ATTACHMENT`/`PHOTO` (staff-uploaded,
`POST .../:id/files`, mirrors `AssetFilesController`'s multipart pattern).

**Templates/rendering (Part 2)**: `apps/api/src/documents/rendering/` —
`VariableResolverService` builds a nested context (company/customer/
employee/asset/rental/quote/today/signature/notes/document/data) that
`resolveVariables()` substitutes into `{{dot.path}}` placeholders
(HTML-escaped, no whitelist). `DocumentRendererService.renderHtml()` is
computed live every call — never persisted. `PdfRendererService` wraps a
reused headless Chromium instance (Puppeteer — a scoped exception to ADR
0007's "no headless browser," `QuotePdfService`'s `pdfkit` pipeline is
untouched); `DocumentPdfService` stores the PDF output as a `DocumentFile`.
`DocumentTemplatesService` (`apps/api/src/documents/document-templates.
service.ts`) manages versioned templates, one `ACTIVE` per
`(tenant, documentType)`.

**Sharing/email/e-signature (Part 2)**: `apps/api/src/documents/sharing/`
(`DocumentSharingService` + `PublicDocumentsController`, both public
routes `POST` not `GET` since a password travels in the body),
`apps/api/src/documents/email/` (`DocumentEmailService`, synchronous send,
durable `DocumentEmailDelivery` rows, `dispatch()` is the future-queue
seam), `apps/api/src/documents/signature/` (`DOCUMENT_SIGNATURE_PROVIDER`
DI token, `LocalMockSignatureProvider` only — third instance of the
swappable-adapter pattern after `StorageAdapter`/`EmailProvider`).
`DocumentSignatureRequest.status` is deliberately not auto-synced to
`Document.status`; staff confirm outcomes via the existing `sign()`/
`reject()` actions.

**Frontend (Part 2)**: `apps/web/src/app/app/documents/**` (list/detail/
preview, template registry/editor) and `apps/web/src/app/share/[token]`
(public, no login) — full UI now exists; there is no document "edit" page
by design (see ADR 0011).

**Still not built**: real e-signature provider integration (DocuSign/Adobe
Sign/Autenti/eIDAS are named but not implemented — only the seam and a
local mock provider exist), and the existing `Quote` module is still not
migrated/duplicated into `Document` rows (see D-021 in DECISIONS.md).

## Customer Portal (TASK-0009)

`apps/api/src/customer-portal/` — see [ADR 0012](adr/0012-customer-portal.md)
for full rationale; this section is the short practical summary.

**Auth is fully separate from staff auth**: its own `JwtModule` bound to
`JWT_CUSTOMER_ACCESS_SECRET` (distinct from `JWT_ACCESS_SECRET`), its own
cookie pair (`rentos_portal_access_token`/`rentos_portal_refresh_token`),
its own `CustomerAuthGuard`/`CustomerTokenService`. Never imports
`AuthModule`. A portal session cannot satisfy a staff route, and vice
versa — verified by a dedicated e2e test. Login is
`tenantSlug + email + password` (`Customer.email` isn't unique per
tenant); a partial unique index enforces at most one activated portal
account per `(tenant, email)`. `PrismaService` globally `omit`s
`portalPasswordHash`/`portalInvitationTokenHash` from every query by
default.

**Every portal service is an ownership-checking wrapper**, never a fork:
`PortalRentalsService`/`PortalDocumentsService`/`PortalAssetsService`/etc.
each wrap the equivalent staff-facing service and add a
`resource.customerId === customerId` check, returning 404 (never 403) on
mismatch. No pricing/availability/rendering/signature logic is duplicated
anywhere in this tree.

**New capability added to an existing service**: `RentalsService
.extendPlannedEnd()` — the only new business-logic method this task added
outside `customer-portal/`, because `update()`'s existing
`EDITABLE_STATUSES` guard structurally cannot touch `plannedEnd` for a
RESERVED/ACTIVE rental. Portal extension-request approval calls this
method; nothing in the portal reimplements pricing or availability logic.

**Damage reports are their own model** (`RentalDamageReport` +
`RentalDamageReportPhoto`), not a `Document` row — `Document
.createdByUserId` has no customer-actor path. `convertToDocument()` is
staff-initiated and creates a real `DAMAGE_REPORT` document.

**Signature/status sync**: unlike ADR 0011's staff-side signature flow
(deliberately not auto-synced to `Document.status`), a customer's own
authenticated portal sign click via `DocumentSignatureService
.customerSign()` **does** advance `Document.status` — the customer's own
click is the confirmation, with no webhook-verification gap.

**Scope boundaries** (all deliberate, see ADR 0012): notifications are
in-app only, no email/push; ZIP bundling of a rental's documents is fully
in-memory (`archiver`, no streaming — `StorageService` has none); the
asset QR code links to the authenticated portal rental page, not a new
public unauthenticated endpoint.

**Frontend**: `apps/web/src/app/portal/**` — `portal/login`,
`portal/invite/[token]` (public), `portal/(shell)/**` (dashboard, rentals

- detail, calendar, documents + detail, messages, notifications, asset
  detail), gated by its own `usePortalMe()` check. Staff-side management
  (`CustomerPortalPanel`) is embedded on the existing customer detail page,
  gated by the new `customers.portal.manage` permission.

**Havelio rebrand**: every visible UI string, page title, browser tab
title, email template, and generated-document footer now reads "Havelio"
instead of "RentOS." Internal package/module names and cookie names are
unchanged for now.

**Still not built**: portal notification emails/push (in-app only today),
a real subdomain-per-tenant deployment (`tenantSlug` is collected via a
form field on login, not resolved from the URL), and a full "message
read" UI badge on the staff side beyond the panel itself.

## Important API conventions

- Every list endpoint returns `{ items, total, page, pageSize }`.
- Every create/update DTO uses `class-validator` decorators; cross-field
  rules (e.g. "the field matching `billingMode` is required") are
  enforced in the service layer's pricing utility, not the DTO.
- `404` for "not found, wrong tenant, or soft-deleted" — never leak
  whether a record exists in another tenant.
- `403` for a valid resource in a tenant the caller isn't a member of, or
  lacking the required permission.
- `409 Conflict` for a valid-but-currently-disallowed state transition
  (e.g. editing items on a non-`DRAFT` rental).
- Server-computed monetary/derived fields (`subtotalMinor`,
  `totalMinor`, snapshot fields) are always present in the response —
  the client never computes these itself for anything it submits.

## Important frontend conventions

- `apiClient.get/post/patch/delete` always send `credentials: "include"`.
- `ApiError` carries the raw backend message; `apiErrorMessage(error,
fallback)` shows it directly for modules with many distinct,
  human-readable validation/conflict messages (Assets, Rentals, Quotes);
  `apiErrorKey(error)` maps to a translation key for auth's smaller,
  enumerable error set.
- Every settings/detail page gates mutating controls behind
  `usePermission("some.permission")` — a UX convenience, always paired
  with the real server-side check.
- `window.confirm(...)` is still used for destructive-action
  confirmation (delete, cancel) — no custom confirmation dialog
  component exists yet.

## Testing strategy

- **Unit tests** (`*.spec.ts` next to the source, Vitest): pure pricing/
  numbering/validation functions, one file per util.
- **Backend e2e tests** (`apps/api/test/*.e2e-spec.ts`, Vitest +
  Supertest, real Postgres via `.env.test` → `rentos_test` database):
  full HTTP-request-level coverage per module — CRUD, tenant isolation,
  permission matrix per role, lifecycle transitions, audit log
  assertions. `cleanDatabase()` (`apps/api/test/db.util.ts`) truncates in
  FK-safe dependency order before every test.
- **Frontend component tests** (`apps/web/test/**/*.test.tsx`, Vitest +
  Testing Library): wizards, detail/list pages, settings pages — hooks
  mocked via `vi.mock`, rendered through `renderWithProviders` (wraps
  `QueryClientProvider` + `I18nextProvider`).
- Every task that touches pricing/numbering has added a concurrency or
  boundary-condition test alongside the happy-path ones (leap years,
  end-of-month, timezone safety, invalid custom values).

## Docker workflow

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d --build
# apply migrations inside the running api container:
docker compose --env-file .env -f docker/docker-compose.yml exec -T api \
  sh -lc "cd /app/apps/api && node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma"
docker compose --env-file .env -f docker/docker-compose.yml down
```

For local (non-Docker) backend development, only `postgres`/`redis` need
to run in Docker; `pnpm dev` runs the API/web processes on the host:

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d postgres redis
```

## Migration workflow

Non-interactive migration generation (this environment cannot run the
interactive `prisma migrate dev` prompt):

```bash
cd apps/api
DATABASE_URL="postgresql://rentos:rentos@localhost:5432/rentos_test?schema=public" \
  npx prisma migrate diff \
    --from-url "postgresql://rentos:rentos@localhost:5432/rentos_test?schema=public" \
    --to-schema-datamodel prisma/schema.prisma \
    --script > /tmp/migration_step.sql
mkdir -p "prisma/migrations/$(date -u +%Y%m%d%H%M%S)_<name>"
# copy the cleaned SQL (strip prisma's update-available banner) into migration.sql
DATABASE_URL="...rentos_test..." npx prisma migrate deploy
DATABASE_URL="...rentos..."      npx prisma migrate deploy   # also apply to the local dev DB
```

Always apply to **both** `rentos` (dev) and `rentos_test` (used by
`apps/api/test/*.e2e-spec.ts`) databases locally before running the full
test suite.

## CI workflow

`.github/workflows/ci.yml`: runs on push/PR to `main`, spins up a real
`postgres:17-alpine` service container, then `pnpm install
--frozen-lockfile` → `format:check` → `lint` → `typecheck` → apply test
DB migrations → `test` → `build`, in that order, all against the same
job. A red step anywhere fails the whole run — there is no
partial-success state to rely on.

## Known limitations (as of the last verified commit above)

- Public quote page and the generated PDF don't render the itemized
  monthly-billing breakdown (only the authenticated wizard/detail page
  do) — the underlying data is already in the API response, so this is
  additive UI work, not a data gap. See
  [ADR 0009](adr/0009-shared-monthly-pricing-and-atomic-rental-numbering.md).
- Public quote page doesn't show the tenant's company name (PDF does).
- Email and object storage now have a real, production-capable provider
  each (`SmtpEmailProvider`/`S3StorageAdapter`, selected via
  `EMAIL_DRIVER`/`STORAGE_DRIVER` — see D-109/ADR 0013), but neither has
  been live-verified against a real external SMTP account or a real
  external cloud storage account in this environment — no credentials
  exist here. `LoggingEmailProvider`/`LocalFilesystemStorageAdapter`
  remain the default for dev/test.
- No production email provider is _configured by default_ — a real
  deployment must set `EMAIL_DRIVER=smtp` and real SMTP credentials, or
  every email attempt stays honestly `NOT_CONFIGURED`.
- No secure per-tenant SMTP credential storage exists — email
  configuration is environment-level only (see D-109); a tenant-managed
  "connect your own SMTP" Settings flow would need a new secret-storage
  primitive first.
- No malware/content scanning on uploaded files (asset images/documents,
  Handover/Return attachments) — MIME allow-list + size limit + private
  storage are the enforced boundary today (see ADR 0005, D-109).
- No presigned/signed temporary download URLs — every file read goes
  through the authenticated streaming API endpoint, by design (see D-109);
  this is a deliberate choice, not a gap, but worth knowing before
  assuming a CDN-fronted read path exists.
- No localization-key-parity lint check (verified manually per task).
- Document Management Platform (TASK-0008, both parts now complete) has
  no real e-signature provider integration — only the swappable seam and
  a `LocalMockSignatureProvider` exist; DocuSign/Adobe Sign/Autenti/eIDAS
  are named in the enum but not implemented. See
  [ADR 0011](adr/0011-document-rendering-and-sharing.md).
- The existing `Quote` module is still not migrated/duplicated into the
  generic `Document` model — a deliberate, documented scope boundary (see
  D-021 in DECISIONS.md), not an oversight.
- No document "edit" page exists in the frontend by design — editing isn't
  in Part 7's required action set, and document content is normally
  populated by the originating workflow (rental/quote conversion), not
  hand-typed by staff.
- Customer Portal (TASK-0009) has no email/push notification channel —
  `CustomerNotification` is in-app only; a customer must visit the portal
  to see an update. See [ADR 0012](adr/0012-customer-portal.md).
- Portal login collects `tenantSlug` as a form field rather than resolving
  it from a subdomain — no subdomain-per-tenant deployment exists yet.
- Internal package/module names and cookie names still say "RentOS" —
  only user-visible strings were rebranded to "Havelio" (deliberate, see
  ADR 0012 decision 10).
- Timeline items never render an inline PDF/image/email preview — no
  such widget exists anywhere in the product; items with a related
  record navigate to it in one click instead. Quote and Document
  Summary are not built — a deliberate, documented Chapter 6 scope
  boundary, not an oversight (see `UI_REDESIGN_PLAN.md` Chapter 6).

Resolved by the pre-TASK-0008 stabilization task (see
[ADR 0009](adr/0009-shared-monthly-pricing-and-atomic-rental-numbering.md)):
Quotes' `MONTHLY` pricing now shares Rentals' tenant-configurable
strategy engine instead of the old whole-month rounding, and
`generateRentalNumber`'s count-then-check race has been replaced with an
atomic, tenant-scoped Postgres sequence.

## Technical debt

See [ROADMAP.md](ROADMAP.md)'s "Technical debt" table for the full,
maintained list.

## Next recommended task

TASK-0009 (Customer Portal + Havelio rebrand) is complete, and a
governance/roadmap task (PRE-TASK-0010 — architecture lock + roadmap
alignment, no product code changed) has since landed on top of it —
see [`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md) and this file's
"Latest verified state" above for the exact commit.

**TASK-0010 (Complete UI/UX Redesign) is the next major task** — see
[ROADMAP.md](ROADMAP.md#task-0010--complete-uiux-redesign) for its full
scope. Do not start it in the same session/branch as this governance
task unless explicitly instructed to. The agreed sequence after
TASK-0010 is TASK-0011 (SaaS plans/subscription billing) through
TASK-0020 (AI assistant/workflow automation) — see
[ROADMAP.md](ROADMAP.md#planned-major-tasks-task-0010-onward) for the
full list and each task's scope. Read
[`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md) before starting any of
them.

## Important commands

```bash
pnpm install                 # from repo root, once
pnpm format:check            # prettier --check .
pnpm lint                    # turbo run lint (eslint per package)
pnpm typecheck                # turbo run typecheck
pnpm test                    # turbo run test (vitest, all packages)
pnpm build                   # turbo run build

# api-specific (run from apps/api, or via pnpm --filter @rentos/api <script>)
npx prisma generate
npx prisma migrate deploy
npx vitest run test/<name>.e2e-spec.ts   # one e2e file
npx vitest run src/<domain>/<file>.spec.ts  # one unit-test file
```
