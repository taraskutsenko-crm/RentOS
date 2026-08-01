import { DocumentType } from "@prisma/client";
import { IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

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
