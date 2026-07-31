import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Body for the "correction" endpoint (POST .../versions) — only callable
 * once the document's current version is already finalized (status is not
 * DRAFT). `reason` is mandatory here (unlike the nullable `reason` column
 * it's stored in) because a correction must explain itself; the initial
 * version created alongside the Document has no such requirement since
 * nothing preceded it.
 */
export class CreateDocumentVersionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;

  /** Omit to carry the current version's business data forward verbatim as the new version's starting point. */
  @IsOptional()
  @IsObject()
  businessData?: Record<string, unknown>;
}
