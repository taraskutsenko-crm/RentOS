import { AssetFieldType } from "@prisma/client";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";
import type { FieldOption, ValidationRules } from "../field-definition-rules";

const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,49}$/;

export class UpdateAssetCustomFieldDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(FIELD_KEY_PATTERN, {
    message: "key must be lowercase letters, digits, and underscores, starting with a letter",
  })
  key?: string;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsEnum(AssetFieldType)
  fieldType?: AssetFieldType;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFilterable?: boolean;

  @IsOptional()
  @IsBoolean()
  isSearchable?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  sortOrder?: number;

  @IsOptional()
  @IsObject()
  validationRules?: ValidationRules;

  @IsOptional()
  @IsArray()
  options?: FieldOption[];
}
