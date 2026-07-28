import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

export class UpdateAssetCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  sortOrder?: number;
}
