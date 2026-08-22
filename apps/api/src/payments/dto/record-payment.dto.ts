import { PaymentMethod } from "@prisma/client";
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";
import { IsSupportedCurrency } from "../../common/is-supported-currency.decorator";

export class RecordPaymentDto {
  /**
   * Minor currency units. Normally positive; a negative value is the
   * documented way to correct a mistaken entry (see docs/DECISIONS.md) —
   * Payment is an append-only ledger, never edited or deleted.
   */
  @IsInt()
  @Min(-1_000_000_000)
  amountMinor!: number;

  @IsOptional()
  @IsSupportedCurrency()
  currency?: string;

  @IsDateString()
  paymentDate!: string;

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
