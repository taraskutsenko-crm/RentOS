import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreatePromoCodeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  code!: string;

  @IsIn(["PERCENTAGE", "FIXED_AMOUNT"])
  discountType!: "PERCENTAGE" | "FIXED_AMOUNT";

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  discountValueBp?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  discountValueMinor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsIn(["ONCE", "REPEATING", "FOREVER"])
  duration!: "ONCE" | "REPEATING" | "FOREVER";

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  durationInMonths?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  @IsOptional()
  @IsBoolean()
  firstTimeCustomerOnly?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(["STARTER", "BUSINESS", "PROFESSIONAL", "ENTERPRISE"], { each: true })
  eligiblePlans?: ("STARTER" | "BUSINESS" | "PROFESSIONAL" | "ENTERPRISE")[];

  @IsOptional()
  @IsIn(["MONTHLY", "ANNUAL"])
  eligibleInterval?: "MONTHLY" | "ANNUAL";

  @IsOptional()
  @IsUUID()
  affiliateCampaignId?: string;
}
