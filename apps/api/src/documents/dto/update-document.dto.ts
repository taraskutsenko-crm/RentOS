import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";
import { DocumentItemDto } from "./document-item.dto";

/**
 * Only allowed while a Document's current version is not yet finalized
 * (status DRAFT) — see DocumentsService.update. Once finalized, use
 * POST .../versions to create a correction instead.
 */
export class UpdateDocumentDto {
  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  rentalId?: string;

  @IsOptional()
  @IsUUID()
  quoteId?: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsUUID()
  employeeUserId?: string;

  @IsOptional()
  @IsObject()
  businessData?: Record<string, unknown>;

  /** When provided, replaces the entire item list. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DocumentItemDto)
  items?: DocumentItemDto[];
}
