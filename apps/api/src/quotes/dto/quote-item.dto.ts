import {
  PartialMonthPolicy,
  QuoteBillingMode,
  QuoteDiscountType,
  QuoteItemType,
} from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

export class QuoteItemDto {
  @IsEnum(QuoteItemType)
  itemType!: QuoteItemType;

  /** Required when itemType is ASSET, forbidden otherwise (enforced in QuotesService, not here). */
  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity?: number;

  /** Free-text display label only (e.g. "day", "hour", "piece") — never used in pricing. */
  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string | null;

  @IsEnum(QuoteBillingMode)
  billingMode!: QuoteBillingMode;

  @IsOptional()
  @IsInt()
  @Min(0)
  unitPriceMinor?: number;

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

  /** Meaningful only when billingMode is MONTHLY — how the leftover partial month is charged. Defaults to the tenant's setting when omitted (see quotes.service.ts). */
  @IsOptional()
  @IsEnum(PartialMonthPolicy)
  partialMonthPolicy?: PartialMonthPolicy;

  @IsOptional()
  @IsEnum(QuoteDiscountType)
  discountType?: QuoteDiscountType;

  /** FIXED: minor currency units. PERCENTAGE: integer basis points (1000 = 10.00%). */
  @IsOptional()
  @IsInt()
  @Min(0)
  discountValue?: number;

  /** Integer basis points (2000 = 20.00%) — never a float rate. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  taxRateBp?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  depositMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
