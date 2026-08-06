import type { TimelineEvent } from "./timeline";

export type CustomerStatus = "ACTIVE" | "INACTIVE";

export interface Customer {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  vatNumber: string | null;
  address: string | null;
  notes: string | null;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PaginatedCustomers {
  items: Customer[];
  total: number;
  page: number;
  pageSize: number;
}

export type CustomerTimelineEventType = "created" | "updated" | "deleted";

export type CustomerTimelineEvent = TimelineEvent<CustomerTimelineEventType>;

export interface CustomerSummary {
  customerSince: string;
  totalRentals: number;
  activeRentals: number;
  totalRevenueMinor: number;
  currency: string | null;
  lastActivityAt: string | null;
  damageReportsCount: number;
}
