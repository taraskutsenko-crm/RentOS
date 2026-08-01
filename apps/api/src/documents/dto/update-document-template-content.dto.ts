import { IsObject, IsOptional, IsString, MinLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

/** Always creates a new DocumentTemplateVersion — template content is never edited in place (see ADR 0011). */
export class UpdateDocumentTemplateContentDto {
  @IsString()
  @MinLength(1)
  htmlContent!: string;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  css?: string | null;

  @IsOptional()
  @IsObject()
  variablesSchema?: Record<string, unknown>;
}
