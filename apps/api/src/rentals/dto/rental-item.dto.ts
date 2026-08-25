import { PartialMonthPolicy, RentalBillingMode } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

export class RentalItemDto {
  @IsUUID()
  assetId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity?: number;

  @IsEnum(RentalBillingMode)
  billingMode!: RentalBillingMode;

  @IsOptional()
  @IsInt()
  @Min(0)
  dailyPriceMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  weeklyPriceMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyPriceMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  customPriceMinor?: number;

  /** Meaningful only when billingMode is MONTHLY — how the leftover partial month is charged. Defaults to the tenant's setting when omitted (see rentals.service.ts). */
  @IsOptional()
  @IsEnum(PartialMonthPolicy)
  partialMonthPolicy?: PartialMonthPolicy;

  @IsOptional()
  @IsInt()
  @Min(0)
  depositMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  discountMinor?: number;

  /**
   * Integer basis points (2300 = 23.00%) — the tax rate applied to this
   * line's own (already-discounted) total. Replaces the old Rental-header
   * flat `taxMinor` amount: the user enters a rate, never a pre-calculated
   * currency amount (see docs/DECISIONS.md, rental tax percentage model).
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  taxRateBp?: number;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
