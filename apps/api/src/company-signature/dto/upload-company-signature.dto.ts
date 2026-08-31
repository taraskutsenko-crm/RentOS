import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import type { SignatureCaptureMethod } from "@prisma/client";

/** A stored company signature is always drawn or uploaded directly — never "reused from itself". */
const STORABLE_METHODS: SignatureCaptureMethod[] = ["DRAWN", "UPLOADED"];

export class UploadCompanySignatureDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  representativeName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  representativeTitle?: string;

  @IsIn(STORABLE_METHODS)
  method!: Extract<SignatureCaptureMethod, "DRAWN" | "UPLOADED">;
}
