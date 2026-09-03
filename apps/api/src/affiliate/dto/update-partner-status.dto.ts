import { IsIn } from "class-validator";

export class UpdatePartnerStatusDto {
  @IsIn(["ACTIVE", "PAUSED", "ENDED"])
  status!: "ACTIVE" | "PAUSED" | "ENDED";
}
