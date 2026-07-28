import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

export class ChangeAssetStatusDto {
  @IsUUID()
  statusId!: string;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}
