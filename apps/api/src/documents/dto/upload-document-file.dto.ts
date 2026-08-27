import { DocumentAttachmentCategory, DocumentFileFormat } from "@prisma/client";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Only ATTACHMENT/PHOTO are accepted here — PDF/HTML/JSON_SNAPSHOT are
 * system-generated renderings, never client-uploaded (no rendering engine
 * exists yet in TASK-0008 Part 1; this endpoint exists for supporting files
 * like a signed scan or a damage photo).
 */
const UPLOADABLE_FORMATS: DocumentFileFormat[] = ["ATTACHMENT", "PHOTO"];

const ATTACHMENT_CATEGORIES: DocumentAttachmentCategory[] = [
  "HANDOVER_CONDITION",
  "RETURN_CONDITION",
  "DAMAGE",
  "OTHER",
];

export class UploadDocumentFileDto {
  @IsIn(UPLOADABLE_FORMATS)
  format!: Extract<DocumentFileFormat, "ATTACHMENT" | "PHOTO">;

  /** Optional — a helpful filter, never a required classification (see DocumentAttachmentCategory). */
  @IsOptional()
  @IsIn(ATTACHMENT_CATEGORIES)
  category?: DocumentAttachmentCategory;

  /** Optional free-text caption, e.g. "Front bumper, minor scratch". */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;
}
