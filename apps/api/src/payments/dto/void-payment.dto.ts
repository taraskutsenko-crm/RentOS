import { IsString, MaxLength, MinLength } from "class-validator";

/** Voiding a Payment (Havelio Payments & Receivables) always requires a reason — an honest audit trail, never a silent disappearance. See docs/DECISIONS.md. */
export class VoidPaymentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
