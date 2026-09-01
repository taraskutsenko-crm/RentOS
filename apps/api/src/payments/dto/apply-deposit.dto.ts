import { IsDateString, IsInt, IsOptional, IsUUID, Min } from "class-validator";

/**
 * "Apply deposit to balance" (Havelio Payments & Receivables, Phase 10) —
 * an explicit financial event a staff member triggers deliberately; a held
 * RentalDeposit is never applied to an Invoice automatically. `amountMinor`
 * must be positive and is validated server-side against both the
 * remaining held deposit balance and the invoice's own remaining balance
 * (see PaymentsService.applyDeposit) — never trusted at face value.
 */
export class ApplyDepositDto {
  @IsUUID()
  rentalDepositId!: string;

  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;
}
