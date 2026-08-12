import { supportedLanguages } from "@rentos/localization";
import { DocumentType } from "@prisma/client";
import {
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

export class CreateDocumentTemplateDto {
  @IsEnum(DocumentType)
  documentType!: DocumentType;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  /**
   * The language the rendered document's own content (not the staff UI) is
   * written in — null means "any language / tenant default", the only
   * value every template had before this field existed. Combined with
   * documentType, this is the uniqueness scope activate() enforces (see
   * DocumentTemplatesService and the partial unique index added in the
   * Pre-Chapter 10 migration).
   */
  @EmptyToNull()
  @IsOptional()
  @IsIn(supportedLanguages, {
    message: `language must be one of: ${supportedLanguages.join(", ")}`,
  })
  language?: string | null;

  @IsString()
  @MinLength(1)
  htmlContent!: string;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  css?: string | null;

  /** Declarative, UI-only list of variable paths this template references — never validated at render time (see ADR 0011). */
  @IsOptional()
  @IsObject()
  variablesSchema?: Record<string, unknown>;
}
