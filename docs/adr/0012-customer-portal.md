# ADR 0012: Customer Portal and Havelio Rebrand (TASK-0009)

**Status:** Accepted
**Date:** 2026-08-01

## Context

Every prior task built staff-facing capability. TASK-0009 adds the first
capability surfaced directly to end customers: a self-service portal
comparable to EquipmentShare, Sharefox, Cheqroom, or the Stripe Customer
Portal — dashboard, rentals, documents (preview/download/sign/ZIP),
extension requests, damage reports, messages, notifications, equipment
info with QR codes, and a rental calendar. It also carries the product's
first visible rebrand: every user-facing string now reads **Havelio**
instead of RentOS (internal package/namespace names are untouched — that is
a separate, larger migration deliberately out of scope here).

This ADR records the architecture decisions specific to the portal. It
assumes and reuses everything already shipped: Documents (ADR 0010/0011),
Rentals (ADR 0006/0008/0009), Quotes (ADR 0007), Customers, Assets,
Storage (ADR 0005), Permissions (ADR 0001), and Email (ADR 0007).

## Decisions

### 1. A second, cryptographically isolated auth stack — not a role on the existing one

A customer is not a `User`, has no `Membership`/role, and must never be able
to reach a single staff-only route. Rather than extending the existing
`AuthModule`/`JwtService`/`rentos_access_token` stack with a "customer" case,
`CustomerPortalModule` owns a **fully separate** stack: its own
`JwtModule.registerAsync()` bound to a distinct secret
(`JWT_CUSTOMER_ACCESS_SECRET`, never reused), its own cookie pair
(`rentos_portal_access_token` / `rentos_portal_refresh_token`, different
names and different paths from the staff cookies), its own `CustomerAuthGuard`,
and its own `CustomerRefreshToken` table. `CustomerPortalModule` does not
import `AuthModule` at all — `PasswordService` is provided directly, the
same way `DocumentsModule` already does since `AuthModule` doesn't export it.
A portal session's JWT is signed with a key a staff-route guard never
verifies against, and vice versa — this is enforced structurally, not just
by convention, and is covered by an explicit e2e test
(`customer-portal-auth.e2e-spec.ts`) that presents a portal token to a
staff-only endpoint and asserts rejection.

**Login identifies the tenant by slug, not by email uniqueness.**
`Customer.email` is optional and not unique per tenant (existing schema,
unchanged), so "email + password" alone cannot resolve an account the way
staff login does. Portal login therefore takes `tenantSlug + email +
password` — the same shape an `app.havelio.net/portal/acme`-style
subdomain-per-tenant deployment would imply. At most one **activated**
portal account may exist per `(tenant, email)`, enforced by a hand-written
partial unique index
(`CREATE UNIQUE INDEX ... WHERE "portalActivatedAt" IS NOT NULL AND "email" IS NOT NULL`)
— the same belt-and-suspenders pattern ADR 0005/0011 already used for
`AssetImage.isPrimary` / one-active-template-per-type.

### 2. Sensitive new `Customer` columns are stripped by default, not by convention

Six new columns land on `Customer` (`portalPasswordHash`,
`portalInvitationTokenHash`, plus four non-secret timestamp columns).
`CustomersController.findOne` returns the raw Prisma object with no
field-stripping today, so adding a password hash directly would leak it to
every staff client that has ever fetched a customer. Rather than auditing
every existing and future call site, `PrismaService`'s constructor sets a
**global `omit`** for those two columns
(`omit: { customer: { portalPasswordHash: true, portalInvitationTokenHash: true } }`),
so they are excluded from every query by default across the whole
application. `PortalAuthService`'s own login/activation lookups are the only
call sites that explicitly opt back in (`omit: { portalPasswordHash: false }`)
where the raw hash is genuinely needed for verification. This is a
defense-in-depth choice: new code cannot accidentally leak these fields
without deliberately opting in.

### 3. Every portal service is an ownership-enforcing wrapper, never a business-logic fork

`PortalRentalsService`, `PortalDocumentsService`, `PortalAssetsService`, etc.
each wrap an existing staff-facing service (`RentalsService`,
`DocumentsService`, `AssetFilesService`, `DocumentSignatureService`) and add
exactly one thing on top: a `resource.customerId === customerId` (or
equivalent join-based) ownership check, returning a uniform 404 — never a
403 — so a customer can never distinguish "not yours" from "doesn't exist."
No pricing, availability, rendering, PDF, or signature logic is duplicated
anywhere in `customer-portal/`; every mutation ultimately calls into the
same service a staff action would use. This directly satisfies the task's
"no duplicated business logic" instruction and keeps the portal from ever
drifting out of sync with staff-side behavior changes.

### 4. Extending a reserved/active rental required one new, additive `RentalsService` method

`RentalsService.update()`'s `EDITABLE_STATUSES` guard
(`["DRAFT", "QUOTE"]`) structurally cannot touch `plannedEnd` for a
`RESERVED`/`ACTIVE` rental — exactly the states a real extension request
targets. Rather than loosening that guard (risking existing DRAFT/QUOTE-edit
behavior) or reimplementing pricing/availability math inside the portal
module (forbidden by decision 3), a new, narrowly-scoped
`RentalsService.extendPlannedEnd()` was added. It reuses the same private
pricing helpers `update()` already uses, calls
`AvailabilityService.assertAvailable()` for only the new tail window
(excluding the rental's own existing booking), and is the single method
`PortalExtensionRequestsService.respond()` calls on approval — never
recomputing anything itself. The full existing rentals/billing-settings e2e
suites (58 tests) were re-run unmodified to confirm this addition changed no
existing behavior.

### 5. Damage reports are their own model, not a `Document` row — bridged to one only on staff conversion

`Document.createdByUserId` is a required FK to `User` with no customer-actor
path, and a customer-submitted report is, by definition, not staff-authored.
Widening that FK to accept a customer was judged out of proportion to this
task's scope and would weaken `Document`'s existing "always staff-authored"
invariant. `RentalDamageReport` (+ `RentalDamageReportPhoto`) is therefore a
standalone, lightweight model with its own lifecycle
(`SUBMITTED → REVIEWED/RESOLVED → CONVERTED_TO_DOCUMENT`). The one bridge
back into the Document platform, `PortalDamageReportsService
.convertToDocument()`, is **staff-initiated** and calls
`DocumentsService.create()` with the reviewing staff member as the author of
record — keeping `Document`'s invariant intact while still letting a
report become a real, signable, downloadable `DAMAGE_REPORT` document when a
staff member decides it should.

### 6. Bridging the signature/Document-status sync ADR 0011 deliberately deferred

ADR 0011 deliberately left `DocumentSignatureRequest.status` unsynced to
`Document.status`, reasoning that no real provider/webhook existed to drive
that transition safely. A customer's own authenticated click on "sign" in
their own portal is a different trust situation — it _is_ the confirmation,
with no webhook-verification gap to worry about. `DocumentSignatureService
.customerSign()` is therefore the one call path that both marks the
signature request `SIGNED` and advances `Document.status` via the existing
`documentsService.sign()`, atomically validating the document's current
status first (so an invalid transition throws before anything is written).
Staff-initiated signature actions are untouched and still require the
separate, explicit `sign()`/`reject()` staff actions ADR 0010 established.

### 7. Notifications: in-app only; ZIP bundling: in-memory; QR codes: portal-only, no new public surface

Three small, deliberate scope boundaries:

- `CustomerNotification` is a plain in-app table (`findMany`, `unreadCount`,
  `markRead`, `markAllRead`) with **no** email/push delivery pipeline. The
  task asked for a notification _center_, not a new delivery channel — email
  already exists for that (invitations, extension responses could be added
  to it later without a schema change).
- `PortalDocumentsService.zipRentalDocuments()` buffers every PDF for a
  rental fully in memory via `archiver` before responding. `StorageService`
  has no streaming interface (ADR 0005), and `MAX_DOCUMENT_SIZE_BYTES`
  already bounds any one file to 20 MB with a realistic rental having a
  handful of documents, not hundreds — so this is safe without adding
  streaming support purely for this one endpoint.
- The QR code (`PortalAssetsService.rentalQrCode()`, via the `qrcode`
  package) encodes a link to the **authenticated** portal rental page
  (`/portal/rentals/:id`), not a new unauthenticated public asset-lookup
  endpoint. Scanning it without an active portal session simply redirects to
  login — no new public surface was built, keeping the portal's auth
  boundary singular (decision 1) rather than adding a second, unauthenticated
  one for convenience.

### 8. Invitation links are returned directly in the API response, mirroring `DocumentSharingService`'s precedent

No real outbound email provider is configured yet (`EmailService` still
resolves to the `LoggingEmailProvider` from ADR 0007). Rather than leaving
staff with no way to actually deliver an invitation today,
`CustomerPortalInvitationsService.invite()` returns the plaintext
`inviteLink` directly in its response to the inviting staff member — the
exact precedent `DocumentSharingService.create()` already set for share
tokens. This solves a real UX gap and makes the whole
invite→activate→login flow deterministically testable via `supertest`
without mocking outbound email. The email is still sent through
`EmailService` in parallel (so a real provider swap starts working for this
flow immediately, with zero code changes) — the link is defense-in-depth
delivery, not a replacement.

### 9. A single consolidated staff controller, one new permission

Every staff-facing portal-administration action (respond to an extension
request, review/convert a damage report, reply to a portal message, view a
customer's portal access status) is gated by one new permission,
`customers.portal.manage` (OWNER/ADMIN/MANAGER by default, matching this
codebase's existing role-tier conventions), and lives in one
`StaffPortalController` rather than one controller per concern — mirroring
how `CustomerPortalInvitationsController` is already sized for a single
concern, just with more than one related action grouped together here.

### 10. Havelio rebrand: visible strings only, package namespaces untouched

Every user-facing string, page title, browser tab title, email template, and
generated-document footer now reads "Havelio." `packages/shared/APP_NAME`,
the root `<title>`, all six locale files' `app.name`, and the document
footer template (`${company.name} · Generated with Havelio`) were the only
files needing changes — npm package names (`@rentos/ui`,
`@rentos/localization`, ...), internal module/class names, and cookie names
(`rentos_access_token`, `rentos_portal_access_token`, ...) are deliberately
untouched, per the task's explicit instruction not to rename internal
namespaces yet. This keeps the rebrand a pure presentation change with zero
risk to running infrastructure, migrations, or deploy configuration.

## Consequences

- Two fully independent JWT/cookie/guard stacks now exist side by side in
  `apps/api`. This is more code than a single unified "actor" auth system
  would need, but it is the only design that makes "a portal session can
  never satisfy a staff route" true by construction rather than by review
  discipline — judged worth the duplication for a customer-facing trust
  boundary.
- `RentalDamageReport` and `Document` now both represent "damage," in
  different lifecycle stages, joined only by `convertedDocumentId`. Staff
  need to know which one they're looking at; this is documented here rather
  than merged into one model that would have compromised `Document`'s
  staff-authorship invariant.
- The portal has no push/email notification channel yet — a customer must
  visit the portal (or already be checking email for other reasons) to see
  an update. Adding a digest email is a natural, additive next step that
  requires no schema change (`CustomerNotification` already has everything
  a digest job would need).
- Invitation delivery today is "staff copies a link" until a real
  `EmailProvider` is configured — functionally identical to how Quotes and
  Document sharing already operate pre-provider, so this is a consistent,
  not a novel, limitation.
