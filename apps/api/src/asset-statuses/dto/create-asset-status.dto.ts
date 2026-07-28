import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

/** Uppercase, machine-safe status code — e.g. AVAILABLE, AWAITING_PARTS. */
const STATUS_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,49}$/;

export class CreateAssetStatusDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @Matches(STATUS_CODE_PATTERN, {
    message: "code must be uppercase letters, digits, and underscores, starting with a letter",
  })
  code!: string;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  colorToken?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string | null;

  @IsOptional()
  @IsBoolean()
  isAvailableForRental?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
