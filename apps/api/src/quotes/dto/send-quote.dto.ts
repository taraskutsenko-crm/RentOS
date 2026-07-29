import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

export class SendQuoteDto {
  /** Overrides the customer's on-file email for this send only. */
  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
