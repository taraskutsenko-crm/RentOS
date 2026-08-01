import type { MembershipRole } from "@prisma/client";

/**
 * Granular, resource-scoped permissions for the Assets module. Controllers
 * must authorize against these, not against `MembershipRole` names
 * directly — see PermissionsGuard.
 */
export const ASSET_PERMISSIONS = [
  "assets.read",
  "assets.create",
  "assets.update",
  "assets.delete",
  "assets.change_status",
  "assets.manage_images",
  "assets.manage_documents",
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

export const ALL_PERMISSIONS = [
  ...ASSET_PERMISSIONS,
  ...RENTAL_PERMISSIONS,
  ...QUOTE_PERMISSIONS,
  ...DOCUMENT_PERMISSIONS,
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
  ],
  TECHNICIAN: [
    "assets.read",
    "assets.update",
    "assets.change_status",
    "assets.manage_images",
    "assets.manage_documents",
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
  ],
  ACCOUNTANT: [...ASSET_READ_ONLY, ...RENTAL_READ_ONLY, ...QUOTE_READ_ONLY, ...DOCUMENT_READ_ONLY],
  VIEWER: [...ASSET_READ_ONLY, ...RENTAL_READ_ONLY, ...QUOTE_READ_ONLY, ...DOCUMENT_READ_ONLY],
};

export function roleHasPermission(role: MembershipRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
