import { IsIn } from "class-validator";

export class ChangePlanDto {
  @IsIn(["STARTER", "BUSINESS", "PROFESSIONAL"])
  plan!: "STARTER" | "BUSINESS" | "PROFESSIONAL";

  @IsIn(["MONTHLY", "ANNUAL"])
  interval!: "MONTHLY" | "ANNUAL";
}
