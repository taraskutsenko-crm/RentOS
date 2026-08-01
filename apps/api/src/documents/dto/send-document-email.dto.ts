import { DocumentEmailRecipientType } from "@prisma/client";
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

export class SendDocumentEmailDto {
  @IsEnum(DocumentEmailRecipientType)
  recipientType!: DocumentEmailRecipientType;

  /** Required (and only allowed) when recipientType is CUSTOM — enforced in DocumentEmailService, not here. */
  @IsOptional()
  @IsEmail()
  customEmail?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string | null;
}
