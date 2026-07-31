import { DocumentType } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";
import { DocumentItemDto } from "./document-item.dto";

export class CreateDocumentDto {
  @IsEnum(DocumentType)
  documentType!: DocumentType;

  /** Required when documentType is CUSTOM, forbidden otherwise (enforced in DocumentsService, not here). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customTypeName?: string;

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

  /** The staff member who performed the real-world action this document records (see Document.employeeUserId). */
  @IsOptional()
  @IsUUID()
  employeeUserId?: string;

  /**
   * The document's structured business data — deliberately untyped/universal
   * (see DocumentVersion.businessDataSnapshot). Becomes version 1's
   * snapshot.
   */
  @IsOptional()
  @IsObject()
  businessData?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DocumentItemDto)
  items?: DocumentItemDto[];
}
