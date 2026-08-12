import { supportedLanguages } from "@rentos/localization";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

/** Metadata-only edit — renaming/re-describing a template never creates a new content version. */
export class UpdateDocumentTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsIn(supportedLanguages, {
    message: `language must be one of: ${supportedLanguages.join(", ")}`,
  })
  language?: string | null;
}
