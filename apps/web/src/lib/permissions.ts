import type { MembershipRole } from "../types/auth";

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

export const CUSTOMER_PORTAL_PERMISSIONS = ["customers.portal.manage"] as const;

export const TENANT_PERMISSIONS = ["tenant.manage"] as const;

export const INVOICE_PERMISSIONS = [
  "invoices.view",
  "invoices.create",
  "invoices.update",
  "invoices.issue",
  "invoices.send",
  "invoices.cancel",
  "invoices.download",
] as const;

export const PAYMENT_PERMISSIONS = ["payments.view", "payments.record", "payments.void"] as const;

export const PAYMENT_DEMAND_PERMISSIONS = [
  "payment_demands.view",
  "payment_demands.create",
  "payment_demands.send",
] as const;

export const BANK_ACCOUNT_PERMISSIONS = ["bankAccounts.view", "bankAccounts.manage"] as const;

export const INTEGRATION_PERMISSIONS = ["integrations.view", "integrations.manage"] as const;

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

export function roleHasPermission(
  role: MembershipRole | undefined,
  permission: Permission,
): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}
