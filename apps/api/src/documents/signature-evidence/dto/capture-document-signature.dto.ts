import type { SignatureCaptureMethod, SignatureSignerType } from "@prisma/client";
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

const SIGNER_TYPES: SignatureSignerType[] = ["TENANT_REPRESENTATIVE", "CUSTOMER"];
const CAPTURE_METHODS: SignatureCaptureMethod[] = ["STORED_SIGNATURE", "DRAWN", "UPLOADED"];

/**
 * Staff-side capture — covers both "sign as the company" (signerType
 * TENANT_REPRESENTATIVE, method STORED_SIGNATURE or DRAWN/UPLOADED) and
 * "customer signs in person on my device" (signerType CUSTOMER, method
 * DRAWN, the only method the customer-facing signing UI offers). The
 * actual image file is a separate multipart part, required unless method
 * is STORED_SIGNATURE (which copies the tenant's saved TenantSignature
 * instead — see DocumentSignatureEvidenceService).
 */
export class CaptureDocumentSignatureDto {
  @IsIn(SIGNER_TYPES)
  signerType!: SignatureSignerType;

  @IsIn(CAPTURE_METHODS)
  method!: SignatureCaptureMethod;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  signerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  signerTitle?: string;

  @IsOptional()
  @IsEmail()
  signerEmail?: string;
}
