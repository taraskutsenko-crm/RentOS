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
] as const;

export const ALL_PERMISSIONS = [...ASSET_PERMISSIONS, ...RENTAL_PERMISSIONS] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

const EVERY_PERMISSION: Permission[] = [...ALL_PERMISSIONS];

const ASSET_READ_ONLY: Permission[] = [
  "assets.read",
  "asset_categories.read",
  "asset_fields.read",
  "asset_statuses.read",
];

const RENTAL_READ_ONLY: Permission[] = ["rentals.view"];

/**
 * Default role -> permission mapping. OWNER and ADMIN get every permission.
 *
 * Assets: MANAGER and TECHNICIAN get full operational control (including
 * images/documents/status changes) but not `assets.delete` or `*.manage`
 * on categories/statuses/fields (configuration stays with OWNER/ADMIN).
 *
 * Rentals: MANAGER gets full lifecycle control except `rentals.delete`
 * (deleting a rental record is destructive and reserved for OWNER/ADMIN,
 * mirroring `assets.delete`). TECHNICIAN — the role that physically
 * handles equipment — gets `view`/`start`/`return` (the two lifecycle
 * steps tied to physically handing over or receiving back an asset) but
 * not `create`/`update`/`reserve`/`cancel` (those are commercial/booking
 * decisions, not physical-handling ones).
 *
 * ACCOUNTANT and VIEWER are read-only across both modules.
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
  ],
  ACCOUNTANT: [...ASSET_READ_ONLY, ...RENTAL_READ_ONLY],
  VIEWER: [...ASSET_READ_ONLY, ...RENTAL_READ_ONLY],
};

export function roleHasPermission(role: MembershipRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
