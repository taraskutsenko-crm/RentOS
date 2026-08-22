import type { MonthlyBillingStrategy, PartialMonthPolicy } from "@prisma/client";

/** The values that actually drive pricing — independent of whether a row exists yet. */
export interface EffectiveRentalBillingSettings {
  monthlyBillingStrategy: MonthlyBillingStrategy;
  customMonthLengthDays: number | null;
  /** Tenant-wide default partial-month policy — see PartialMonthPolicy (DECISIONS.md D-072). */
  partialMonthPolicy: PartialMonthPolicy;
}

/** API response shape for GET — reports whether the tenant has ever customized this. */
export interface RentalBillingSettingsView extends EffectiveRentalBillingSettings {
  tenantId: string;
  isDefault: boolean;
  updatedAt: string | null;
}
