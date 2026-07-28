import { Transform, Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

export class UpdateAssetImageDto {
  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  altText?: string | null;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === "true" || value === true)
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  sortOrder?: number;
}
