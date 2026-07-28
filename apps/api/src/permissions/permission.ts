import type { MembershipRole } from "@prisma/client";

/**
 * Granular, resource-scoped permissions for the Assets module (and future
 * business modules). Controllers must authorize against these, not against
 * `MembershipRole` names directly — see PermissionsGuard.
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

export type Permission = (typeof ASSET_PERMISSIONS)[number];

const ALL_ASSET_PERMISSIONS: Permission[] = [...ASSET_PERMISSIONS];

const READ_ONLY_PERMISSIONS: Permission[] = [
  "assets.read",
  "asset_categories.read",
  "asset_fields.read",
  "asset_statuses.read",
];

/**
 * Default role -> permission mapping. OWNER and ADMIN get every permission.
 * MANAGER and TECHNICIAN get full operational control over assets
 * (including images/documents/status changes) but not `assets.delete` or
 * `*.manage` on categories/statuses/fields (configuration stays with
 * OWNER/ADMIN). ACCOUNTANT and VIEWER are read-only across the module.
 *
 * Known limitation: the spec asks TECHNICIAN to be restricted to
 * "condition/location" updates and "allowed operational" status changes,
 * but the permission model here is resource-level, not field- or
 * value-level. TECHNICIAN therefore gets the same `assets.update` /
 * `assets.change_status` as MANAGER. Field- and value-scoped authorization
 * would need a finer-grained policy engine — out of scope for this task.
 */
export const ROLE_PERMISSIONS: Record<MembershipRole, Permission[]> = {
  OWNER: ALL_ASSET_PERMISSIONS,
  ADMIN: ALL_ASSET_PERMISSIONS,
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
  ],
  ACCOUNTANT: READ_ONLY_PERMISSIONS,
  VIEWER: READ_ONLY_PERMISSIONS,
};

export function roleHasPermission(role: MembershipRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
