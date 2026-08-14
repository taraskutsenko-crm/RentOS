import { DocumentType } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

/** Renders unsaved draft HTML/CSS against synthetic sample data — see DocumentTemplatesController#preview. */
export class PreviewDocumentTemplateDto {
  @IsEnum(DocumentType)
  documentType!: DocumentType;

  @IsString()
  @MinLength(1)
  htmlContent!: string;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  css?: string | null;
}
