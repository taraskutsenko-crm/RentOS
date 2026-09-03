import { IsOptional, IsUUID } from "class-validator";

export class AdminOverrideAttributionDto {
  @IsUUID()
  partnerId!: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;
}
