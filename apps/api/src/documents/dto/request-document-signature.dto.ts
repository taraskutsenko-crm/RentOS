import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

export class RequestDocumentSignatureDto {
  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  signerName?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsEmail()
  signerEmail?: string | null;
}
