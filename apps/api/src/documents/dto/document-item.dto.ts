import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

/**
 * One line of a multi-line/multi-asset Document (see DocumentItem's schema
 * doc comment). `data` is deliberately an untyped JSON object — the
 * universal, per-item structured-data escape hatch (e.g. per-asset
 * condition/damage details) — never hardcoded fields, since a new document
 * type must never require a schema or DTO change.
 */
export class DocumentItemDto {
  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsUUID()
  rentalItemId?: string;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  sortOrder?: number;
}
