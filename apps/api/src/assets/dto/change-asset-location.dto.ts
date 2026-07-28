import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

export class ChangeAssetLocationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  newLocation!: string;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}
