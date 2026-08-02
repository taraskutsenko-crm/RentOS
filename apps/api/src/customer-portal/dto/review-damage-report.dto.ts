import { IsIn } from "class-validator";

export class ReviewDamageReportDto {
  @IsIn(["REVIEWED", "RESOLVED"])
  status!: "REVIEWED" | "RESOLVED";
}
