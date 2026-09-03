import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateCheckoutSessionDto {
  @IsIn(["STARTER", "BUSINESS", "PROFESSIONAL"])
  plan!: "STARTER" | "BUSINESS" | "PROFESSIONAL";

  @IsIn(["MONTHLY", "ANNUAL"])
  interval!: "MONTHLY" | "ANNUAL";

  @IsOptional()
  @IsString()
  @MaxLength(64)
  promoCode?: string;
}
