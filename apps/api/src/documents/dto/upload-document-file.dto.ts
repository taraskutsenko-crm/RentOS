import { DocumentFileFormat } from "@prisma/client";
import { IsIn } from "class-validator";

/**
 * Only ATTACHMENT/PHOTO are accepted here — PDF/HTML/JSON_SNAPSHOT are
 * system-generated renderings, never client-uploaded (no rendering engine
 * exists yet in TASK-0008 Part 1; this endpoint exists for supporting files
 * like a signed scan or a damage photo).
 */
const UPLOADABLE_FORMATS: DocumentFileFormat[] = ["ATTACHMENT", "PHOTO"];

export class UploadDocumentFileDto {
  @IsIn(UPLOADABLE_FORMATS)
  format!: Extract<DocumentFileFormat, "ATTACHMENT" | "PHOTO">;
}
