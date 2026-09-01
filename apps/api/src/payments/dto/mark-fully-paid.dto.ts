import { PaymentMethod } from "@prisma/client";
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

/**
 * "Mark as paid" (Havelio Payments & Receivables, one-click full payment) —
 * deliberately has NO `amountMinor` field. The exact remaining balance is
 * always computed server-side at the moment of the request, inside the
 * same locked transaction that creates the Payment row — the frontend can
 * never invent or influence the amount (see PaymentsService.markFullyPaid).
 */
export class MarkFullyPaidDto {
  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}
