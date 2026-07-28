import type { Asset } from "./asset";
import type { Customer } from "./customer";

export type RentalStatus =
  "DRAFT" | "QUOTE" | "RESERVED" | "ACTIVE" | "RETURNED" | "COMPLETED" | "CANCELLED";

export type RentalBillingMode = "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";

export interface RentalItem {
  id: string;
  tenantId: string;
  rentalId: string;
  assetId: string;
  quantity: number;
  billingMode: RentalBillingMode;
  dailyPriceMinor: number | null;
  weeklyPriceMinor: number | null;
  monthlyPriceMinor: number | null;
  customPriceMinor: number | null;
  depositMinor: number;
  discountMinor: number;
  notes: string | null;
  returnedAt: string | null;
  createdAt: string;
  updatedAt: string;
  asset: Asset;
}

export interface Rental {
  id: string;
  tenantId: string;
  customerId: string;
  rentalNumber: string;
  status: RentalStatus;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  notes: string | null;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdByUserId: string;
  updatedByUserId: string | null;
  customer: Customer;
  items: RentalItem[];
}

export interface RentalListItem extends Omit<Rental, "items"> {
  itemCount: number;
}

export interface PaginatedRentals {
  items: RentalListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export type RentalTimelineEventType = "created" | "updated" | "status_changed" | "items_returned";

export interface RentalTimelineEvent {
  id: string;
  type: RentalTimelineEventType;
  occurredAt: string;
  actorUserId: string | null;
  data: Record<string, unknown>;
}

export interface AvailabilityConflict {
  rentalId: string;
  rentalNumber: string;
  plannedStart: string;
  plannedEnd: string;
}

export interface AssetAvailabilityResult {
  assetId: string;
  isAvailable: boolean;
  conflicts: AvailabilityConflict[];
}
