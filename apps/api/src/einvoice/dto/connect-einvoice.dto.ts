import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class ConnectEInvoiceDto {
  /**
   * The provider credential (e.g. a KSeF token) — encrypted at rest
   * immediately (see EncryptionService) and never echoed back in any API
   * response or log line.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  credentials!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  environment?: string;
}
