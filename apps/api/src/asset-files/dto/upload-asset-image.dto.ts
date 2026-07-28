import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

export class UploadAssetImageDto {
  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  altText?: string | null;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === "true" || value === true)
  @IsBoolean()
  isPrimary?: boolean;
}
