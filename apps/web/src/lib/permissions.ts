import type { MembershipRole } from "../types/auth";

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

export const ALL_PERMISSIONS = [
  ...ASSET_PERMISSIONS,
  ...RENTAL_PERMISSIONS,
  ...QUOTE_PERMISSIONS,
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

const EVERY_PERMISSION: Permission[] = [...ALL_PERMISSIONS];
const ASSET_READ_ONLY: Permission[] = [
  "assets.read",
  "asset_categories.read",
  "asset_fields.read",
  "asset_statuses.read",
];
const RENTAL_READ_ONLY: Permission[] = ["rentals.view"];
const QUOTE_READ_ONLY: Permission[] = ["quotes.view", "quotes.download"];

/**
 * Mirrors apps/api/src/permissions/permission.ts. This is a UX convenience
 * only — hiding/disabling controls a user can't use — never a security
 * boundary; the API independently re-checks every permission server-side.
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
    "quotes.view",
    "quotes.create",
    "quotes.update",
    "quotes.send",
    "quotes.accept",
    "quotes.reject",
    "quotes.convert",
    "quotes.duplicate",
    "quotes.download",
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
  ACCOUNTANT: [...ASSET_READ_ONLY, ...RENTAL_READ_ONLY, ...QUOTE_READ_ONLY],
  VIEWER: [...ASSET_READ_ONLY, ...RENTAL_READ_ONLY, ...QUOTE_READ_ONLY],
};

export function roleHasPermission(
  role: MembershipRole | undefined,
  permission: Permission,
): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}
