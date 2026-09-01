import type { MembershipRole } from "@prisma/client";

/**
 * Granular, resource-scoped permissions for the Assets module. Controllers
 * must authorize against these, not against `MembershipRole` names
 * directly — see PermissionsGuard.
 *
 * `assets.manage_availability` is deliberately separate from
 * `assets.change_status`: changing Asset.currentStatusId is a single
 * "right now" global-status edit, while managing availability blocks
 * creates/cancels a date-ranged AssetAvailabilityBlock (maintenance/repair/
 * inspection/relocation/manual-block) — a different, temporal concept (see
 * AvailabilityService). Reading blocks only requires `assets.read`; this
 * permission gates writes.
 */
export const ASSET_PERMISSIONS = [
  "assets.read",
  "assets.create",
  "assets.update",
  "assets.delete",
  "assets.change_status",
  "assets.manage_images",
  "assets.manage_documents",
  "assets.manage_availability",
  "asset_categories.read",
  "asset_categories.manage",
  "asset_fields.read",
  "asset_fields.manage",
  "asset_statuses.read",
  "asset_statuses.manage",
] as const;

/**
 * Granular permissions for the Rentals module (TASK-0006). `rentals.view`
 * is deliberately named `view` (not `read`, unlike the Assets module) to
 * match the task's own endpoint/permission naming exactly.
 *
 * `rental_settings.*` gate the tenant-wide monthly billing strategy
 * configuration (see ADR 0008) — a separate pair rather than reusing
 * `rentals.update`, since changing how MONTHLY is priced tenant-wide is a
 * financial policy decision, not a per-rental operational one (same
 * reasoning as `asset_categories.manage` being distinct from `assets.update`).
 *
 * `rentals.manage_deposit` gates recording/returning a RentalDeposit — kept
 * separate from `rentals.update` because deposit receipt/return legitimately
 * happens on a RESERVED/ACTIVE/RETURNED rental whose items/dates are already
 * locked (see EDITABLE_STATUSES), so it must not be constrained by whatever
 * status gating `rentals.update` itself is subject to.
 */
export const RENTAL_PERMISSIONS = [
  "rentals.view",
  "rentals.create",
  "rentals.update",
  "rentals.delete",
  "rentals.reserve",
  "rentals.start",
  "rentals.return",
  "rentals.cancel",
  "rentals.manage_deposit",
  "rental_settings.view",
  "rental_settings.manage",
] as const;

/**
 * Granular permissions for the Quotes module (TASK-0007). `quotes.accept`/
 * `quotes.reject` gate the *staff-recorded* accept/reject endpoints (e.g. a
 * customer approved verbally) — the public customer-facing accept/reject
 * flow uses a token, not a membership role, and is never gated by these.
 * `quotes.manageTemplates` is a reserved extension point for a future
 * PDF/email template editor — no such feature exists yet (same convention
 * ADR 0001 used for a permission with no matching endpoint yet).
 */
export const QUOTE_PERMISSIONS = [
  "quotes.view",
  "quotes.create",
  "quotes.update",
  "quotes.delete",
  "quotes.send",
  "quotes.accept",
  "quotes.reject",
  "quotes.convert",
  "quotes.duplicate",
  "quotes.download",
  "quotes.manageTemplates",
] as const;

/**
 * Granular permissions for the Document Management Platform (TASK-0008 Part
 * 1). `documents.sign`/`documents.void`/`documents.archive` gate the
 * corresponding lifecycle status transitions; `documents.manageTemplates`
 * is a reserved extension point for a future template editor, same
 * convention as `quotes.manageTemplates` — no such editor exists yet.
 */
/**
 * `documents.templates.view`/`documents.templates.manage` (TASK-0008 Part
 * 2) gate the real template registry (create/edit/version/activate/
 * archive/restore/duplicate) that `documents.manageTemplates` above was
 * originally reserved for — kept as a separate, more specific pair rather
 * than reusing `documents.manageTemplates`, since Part 2 also introduces
 * `documents.render` (generate a preview/PDF) and `documents.share`
 * (create/manage a public link), and grouping the whole template surface
 * under its own `documents.templates.*` namespace reads more clearly than
 * a single flat permission once there's an entire sub-resource behind it.
 * `documents.manageTemplates` itself is left in place, unused, rather than
 * removed — see docs/adr/0011-document-rendering-and-sharing.md.
 */
export const DOCUMENT_PERMISSIONS = [
  "documents.view",
  "documents.create",
  "documents.update",
  "documents.delete",
  "documents.send",
  "documents.sign",
  "documents.void",
  "documents.archive",
  "documents.download",
  "documents.manageTemplates",
  "documents.templates.view",
  "documents.templates.manage",
  "documents.render",
  "documents.share",
] as const;

/**
 * Staff-side administration of a Customer's portal access — inviting them,
 * revoking access, viewing their portal activity (messages, extension
 * requests, damage reports). Kept as a single coarse permission (not a
 * `customers.portal.*` family) since the Customers module itself has no
 * fine-grained permission gating yet (see CustomersController, which only
 * applies TenantGuard) — this is additive, not a retrofit of that existing
 * behavior. See docs/adr/0012-customer-portal.md.
 */
export const CUSTOMER_PORTAL_PERMISSIONS = ["customers.portal.manage"] as const;

/**
 * Gates `PATCH /tenants/:tenantId` — editing the tenant's company-identity
 * fields (name, registration/tax numbers, address, phone) shown on
 * generated documents/contracts. OWNER/ADMIN only, same tier as
 * `rental_settings.manage`/`asset_categories.manage` (tenant-wide
 * configuration, not a per-record operational action).
 */
export const TENANT_PERMISSIONS = ["tenant.manage"] as const;

/**
 * Granular permissions for the Invoice domain (PRE-CHAPTER-10 invoicing
 * addition — see docs/DECISIONS.md). `invoices.issue` gates the one-way
 * DRAFT -> ISSUED transition that freezes an invoice's snapshots;
 * `invoices.cancel` gates voiding an already-issued invoice. There is
 * deliberately no `invoices.delete` — an issued invoice is a legal record
 * and is never deleted, only cancelled (mirrors Document's
 * "never delete a finalized version" policy).
 */
export const INVOICE_PERMISSIONS = [
  "invoices.view",
  "invoices.create",
  "invoices.update",
  "invoices.issue",
  "invoices.send",
  "invoices.cancel",
  "invoices.download",
] as const;

/**
 * `payments.record` gates POST-ing a new Payment row against an Invoice
 * (including the one-click "Mark as paid" action and "Apply deposit to
 * balance" — both are just specific, safer ways to create a Payment row,
 * not a separate capability tier). `payments.void` is deliberately
 * separate and not implied by `payments.record`: reversing a payment is a
 * more sensitive action than recording a new one, even though the ledger
 * itself stays append-only (see docs/DECISIONS.md) — nothing is ever
 * edited or hard-deleted, `payments.void` only gates layering
 * `voidedAt`/`voidedByUserId`/`voidReason` onto an existing row.
 */
export const PAYMENT_PERMISSIONS = ["payments.view", "payments.record", "payments.void"] as const;

/**
 * Gates the Havelio Payment Demand / Collection Notice system (see
 * docs/PRODUCT_BIBLE.md) — an international core concept, Poland's
 * "Wezwanie do zapłaty" being only its first localized template.
 * `payment_demands.create` also covers generating the PDF; `.send` gates
 * emailing it, matching the existing `invoices.send` split.
 */
export const PAYMENT_DEMAND_PERMISSIONS = [
  "payment_demands.view",
  "payment_demands.create",
  "payment_demands.send",
] as const;

/**
 * Gates the Company Profile "Banking" settings page (multiple
 * CompanyBankAccount rows). `bankAccounts.manage` is tenant-wide financial
 * configuration, same tier as `tenant.manage`/`rental_settings.manage` —
 * OWNER/ADMIN only.
 */
export const BANK_ACCOUNT_PERMISSIONS = ["bankAccounts.view", "bankAccounts.manage"] as const;

/**
 * Gates Settings -> Integrations (the country-specific e-invoice provider
 * boundary, e.g. Poland's KSeF — see docs/DECISIONS.md). OWNER/ADMIN only:
 * connecting/disconnecting an e-invoicing provider is tenant-wide
 * compliance configuration, not an operational action.
 */
export const INTEGRATION_PERMISSIONS = ["integrations.view", "integrations.manage"] as const;

/**
 * Gates the Financial Reports & Analytics module (docs/PRODUCT_BIBLE.md) —
 * a read-only aggregation layer over the existing Invoice/Payment/
 * RentalDeposit/PaymentDemand data, never a new write surface.
 * `finance.export` is deliberately separate from `finance.read` (mirrors
 * `payments.void` vs `payments.record`): downloading a CSV/XLSX/PDF copy of
 * tenant financial data is a more sensitive action than viewing it on
 * screen, even though both are read-only against the ledger.
 */
export const FINANCE_REPORTS_PERMISSIONS = ["finance.read", "finance.export"] as const;

export const ALL_PERMISSIONS = [
  ...ASSET_PERMISSIONS,
  ...RENTAL_PERMISSIONS,
  ...QUOTE_PERMISSIONS,
  ...DOCUMENT_PERMISSIONS,
  ...CUSTOMER_PORTAL_PERMISSIONS,
  ...TENANT_PERMISSIONS,
  ...INVOICE_PERMISSIONS,
  ...PAYMENT_PERMISSIONS,
  ...PAYMENT_DEMAND_PERMISSIONS,
  ...BANK_ACCOUNT_PERMISSIONS,
  ...INTEGRATION_PERMISSIONS,
  ...FINANCE_REPORTS_PERMISSIONS,
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

const EVERY_PERMISSION: Permission[] = [...ALL_PERMISSIONS];

const ASSET_READ_ONLY: Permission[] = [
  "assets.read",
  "asset_categories.read",
  "asset_fields.read",
  "asset_statuses.read",
];

const RENTAL_READ_ONLY: Permission[] = ["rentals.view", "rental_settings.view"];

const QUOTE_READ_ONLY: Permission[] = ["quotes.view", "quotes.download"];

const DOCUMENT_READ_ONLY: Permission[] = [
  "documents.view",
  "documents.download",
  "documents.templates.view",
];

const INVOICE_READ_ONLY: Permission[] = ["invoices.view", "invoices.download"];

const PAYMENT_READ_ONLY: Permission[] = ["payments.view"];

const PAYMENT_DEMAND_READ_ONLY: Permission[] = ["payment_demands.view"];

const BANK_ACCOUNT_READ_ONLY: Permission[] = ["bankAccounts.view"];

const FINANCE_REPORTS_READ_ONLY: Permission[] = ["finance.read"];

/**
 * Default role -> permission mapping. OWNER and ADMIN get every permission.
 *
 * Assets: MANAGER and TECHNICIAN get full operational control (including
 * images/documents/status changes) but not `assets.delete` or `*.manage`
 * on categories/statuses/fields (configuration stays with OWNER/ADMIN).
 *
 * Rentals: MANAGER gets full lifecycle control except `rentals.delete`
 * (deleting a rental record is destructive and reserved for OWNER/ADMIN,
 * mirroring `assets.delete`) and `rental_settings.manage` (changing the
 * tenant-wide monthly billing strategy is a financial policy decision
 * reserved for OWNER/ADMIN, mirroring `asset_categories.manage`) — MANAGER
 * can still view it. TECHNICIAN — the role that physically handles
 * equipment — gets `view`/`start`/`return` (the two lifecycle steps tied
 * to physically handing over or receiving back an asset) but not
 * `create`/`update`/`reserve`/`cancel`/`rental_settings.*` (those are
 * commercial/booking decisions, not physical-handling ones).
 *
 * Quotes: MANAGER gets full commercial control except `quotes.delete` and
 * `quotes.manageTemplates` (destructive/configuration actions reserved for
 * OWNER/ADMIN, same reasoning as Assets/Rentals). TECHNICIAN gets no quote
 * permissions at all — a commercial offer is never something the
 * equipment-handling role creates or approves.
 *
 * ACCOUNTANT and VIEWER are read-only across all three modules (Quotes:
 * `view`+`download` only — they can retrieve the PDF for bookkeeping but
 * never send/accept/reject/convert).
 *
 * Documents (TASK-0008 Part 1): MANAGER gets full lifecycle control
 * (create/update/send/sign/void/archive/download) except `documents.delete`
 * and `documents.manageTemplates`, mirroring Quotes exactly. TECHNICIAN gets
 * `view`/`create`/`update`/`download` — the physical-handling role produces
 * handover/return/damage-report documents, same rationale as its Rentals
 * `start`/`return` grants — but not `send`/`sign`/`void`/`archive`, which
 * are commercial/legal lifecycle decisions. ACCOUNTANT/VIEWER are
 * `view`+`download` only, same as Quotes.
 *
 * Documents Part 2 (rendering/templates/sharing, TASK-0008 Part 2): MANAGER
 * additionally gets `documents.templates.view`/`documents.render`/
 * `documents.share` but not `documents.templates.manage` (template
 * authoring is tenant-wide configuration, reserved for OWNER/ADMIN, same
 * reasoning as `asset_categories.manage`/`rental_settings.manage`).
 * TECHNICIAN additionally gets `documents.render` only (it can generate a
 * fresh PDF of a document it created, e.g. a handover protocol) but not
 * template management or public sharing. ACCOUNTANT/VIEWER additionally
 * get `documents.templates.view` (read-only visibility into what templates
 * exist), same read-only-everywhere pattern as the rest of this file.
 *
 * Invoicing (PRE-CHAPTER-10 addition): ACCOUNTANT — previously read-only
 * everywhere — gets real operational control here (`invoices.view/create/
 * update/issue/send/download/cancel`, `payments.view/record`,
 * `bankAccounts.view`), since invoicing/payment-tracking is exactly this
 * role's job; it does not get `bankAccounts.manage`/`integrations.manage`
 * (tenant-wide financial configuration, reserved for OWNER/ADMIN, same
 * tier as `tenant.manage`). MANAGER gets the same operational invoice/
 * payment set as ACCOUNTANT (consistent with its full commercial control
 * elsewhere) plus `bankAccounts.view` but not `.manage`/`integrations.*`.
 * TECHNICIAN gets no invoice/payment/bank-account permissions at all — a
 * commercial/financial document is never something the equipment-handling
 * role creates or approves, same reasoning as its lack of quote
 * permissions. VIEWER is read-only (`invoices.view/download`,
 * `payments.view`, `bankAccounts.view`).
 *
 * Availability blocks + deposits: MANAGER and TECHNICIAN both get
 * `assets.manage_availability` (scheduling maintenance/repair/inspection/
 * relocation/manual blocks is physical-equipment work both roles do).
 * MANAGER and ACCOUNTANT get `rentals.manage_deposit` (recording deposit
 * receipt/return is commercial/financial, matching their existing
 * invoice/payment grants); TECHNICIAN does not.
 *
 * Financial Reports & Analytics V1: MANAGER and ACCOUNTANT get both
 * `finance.read`/`finance.export` — same tier as their invoicing/payment
 * grants, since financial reporting is exactly this work. VIEWER gets
 * `finance.read` only (can see the dashboard but not download a copy),
 * matching its read-only-everywhere pattern. TECHNICIAN gets neither —
 * consistent with it having no invoice/payment visibility at all.
 *
 * Known limitation: the permission model is resource-level, not field- or
 * value-level (e.g. TECHNICIAN's asset `update` isn't restricted to only
 * condition/location fields). See ADR references in each module's
 * documentation for how this tradeoff is judged acceptable at this stage.
 */
export const ROLE_PERMISSIONS: Record<MembershipRole, Permission[]> = {
  OWNER: EVERY_PERMISSION,
  ADMIN: EVERY_PERMISSION,
  MANAGER: [
    "assets.read",
    "assets.create",
    "assets.update",
    "assets.change_status",
    "assets.manage_images",
    "assets.manage_documents",
    "assets.manage_availability",
    "asset_categories.read",
    "asset_fields.read",
    "asset_statuses.read",
    "rentals.view",
    "rentals.create",
    "rentals.update",
    "rentals.reserve",
    "rentals.start",
    "rentals.return",
    "rentals.cancel",
    "rentals.manage_deposit",
    "rental_settings.view",
    "quotes.view",
    "quotes.create",
    "quotes.update",
    "quotes.send",
    "quotes.accept",
    "quotes.reject",
    "quotes.convert",
    "quotes.duplicate",
    "quotes.download",
    "documents.view",
    "documents.create",
    "documents.update",
    "documents.send",
    "documents.sign",
    "documents.void",
    "documents.archive",
    "documents.download",
    "documents.templates.view",
    "documents.render",
    "documents.share",
    "customers.portal.manage",
    "invoices.view",
    "invoices.create",
    "invoices.update",
    "invoices.issue",
    "invoices.send",
    "invoices.cancel",
    "invoices.download",
    "payments.view",
    "payments.record",
    "payments.void",
    "payment_demands.view",
    "payment_demands.create",
    "payment_demands.send",
    "bankAccounts.view",
    "finance.read",
    "finance.export",
  ],
  TECHNICIAN: [
    "assets.read",
    "assets.update",
    "assets.change_status",
    "assets.manage_images",
    "assets.manage_documents",
    "assets.manage_availability",
    "asset_categories.read",
    "asset_fields.read",
    "asset_statuses.read",
    "rentals.view",
    "rentals.start",
    "rentals.return",
    "documents.view",
    "documents.create",
    "documents.update",
    "documents.download",
    "documents.render",
    // Havelio Signature System (docs/PRODUCT_BIBLE.md): TECHNICIAN is the
    // role that physically performs Handover/Return, so it must be able
    // to capture an in-person customer signature (and its own
    // representative signature) directly on the spot, without needing an
    // OWNER/MANAGER to click "Sign" separately.
    "documents.sign",
  ],
  ACCOUNTANT: [
    ...ASSET_READ_ONLY,
    ...RENTAL_READ_ONLY,
    ...QUOTE_READ_ONLY,
    ...DOCUMENT_READ_ONLY,
    "invoices.view",
    "invoices.create",
    "invoices.update",
    "invoices.issue",
    "invoices.send",
    "invoices.cancel",
    "invoices.download",
    "payments.view",
    "payments.record",
    "payments.void",
    "payment_demands.view",
    "payment_demands.create",
    "payment_demands.send",
    "bankAccounts.view",
    "rentals.manage_deposit",
    "finance.read",
    "finance.export",
  ],
  VIEWER: [
    ...ASSET_READ_ONLY,
    ...RENTAL_READ_ONLY,
    ...QUOTE_READ_ONLY,
    ...DOCUMENT_READ_ONLY,
    ...INVOICE_READ_ONLY,
    ...PAYMENT_READ_ONLY,
    ...PAYMENT_DEMAND_READ_ONLY,
    ...BANK_ACCOUNT_READ_ONLY,
    ...FINANCE_REPORTS_READ_ONLY,
  ],
};

export function roleHasPermission(role: MembershipRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
