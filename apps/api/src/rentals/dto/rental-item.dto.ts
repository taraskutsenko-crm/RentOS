import { RentalBillingMode } from "@prisma/client";
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

  @IsOptional()
  @IsInt()
  @Min(0)
  depositMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  discountMinor?: number;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
