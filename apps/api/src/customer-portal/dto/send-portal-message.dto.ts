import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class SendPortalMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  /** Omit for a general (not rental-specific) message. */
  @IsOptional()
  @IsUUID()
  rentalId?: string;
}
