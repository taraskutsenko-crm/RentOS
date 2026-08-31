export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  preferredLanguage: string;
  emailVerifiedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  countryCode: string;
  defaultLanguage: string;
  defaultCurrency: string;
  timezone: string;
  registrationNumber: string | null;
  taxNumber: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  /**
   * Havelio Company Branding (docs/PRODUCT_BIBLE.md) — presence of a mime
   * type is how the UI knows a logo is configured; the raw storage key is
   * never sent to the frontend (see PrismaService's global `omit` config).
   * Width/height let the logo preview reserve layout space without a flash.
   */
  logoMimeType: string | null;
  logoWidth: number | null;
  logoHeight: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type MembershipRole = "OWNER" | "ADMIN" | "MANAGER" | "ACCOUNTANT" | "TECHNICIAN" | "VIEWER";
