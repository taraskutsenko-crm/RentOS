import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class CreateDamageReportDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  description!: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;
}
