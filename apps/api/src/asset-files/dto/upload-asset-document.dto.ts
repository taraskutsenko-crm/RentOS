import { AssetDocumentType } from "@prisma/client";
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

export class UploadAssetDocumentDto {
  @IsEnum(AssetDocumentType)
  documentType!: AssetDocumentType;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @EmptyToNull()
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}
