import { DocumentType } from "@prisma/client";
import { IsEnum } from "class-validator";

export class QueryActiveLanguagesDto {
  @IsEnum(DocumentType)
  documentType!: DocumentType;
}
