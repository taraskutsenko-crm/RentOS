import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * All fields optional — recipient defaults to the invoice's own frozen
 * `buyerSnapshot.email` (see InvoicesService.create), subject/message get a
 * sensible default in InvoiceEmailService. Mirrors SendQuoteDto/document
 * email DTOs' shape.
 */
export class SendInvoiceEmailDto {
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
