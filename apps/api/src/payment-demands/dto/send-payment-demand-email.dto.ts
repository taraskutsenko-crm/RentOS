import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

/** Mirrors SendInvoiceEmailDto's shape exactly — recipient defaults to the demand's own frozen `debtorSnapshot.email`. */
export class SendPaymentDemandEmailDto {
  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;
}
