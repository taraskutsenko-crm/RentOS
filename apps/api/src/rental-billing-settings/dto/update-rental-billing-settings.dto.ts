import { MonthlyBillingStrategy, PartialMonthPolicy } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";

export class UpdateRentalBillingSettingsDto {
  @IsEnum(MonthlyBillingStrategy)
  monthlyBillingStrategy!: MonthlyBillingStrategy;

  /** Required only when monthlyBillingStrategy is CUSTOM — enforced in the service, not here. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  customMonthLengthDays?: number;

  @IsEnum(PartialMonthPolicy)
  partialMonthPolicy!: PartialMonthPolicy;
}
