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
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type MembershipRole = "OWNER" | "ADMIN" | "MANAGER" | "ACCOUNTANT" | "TECHNICIAN" | "VIEWER";
