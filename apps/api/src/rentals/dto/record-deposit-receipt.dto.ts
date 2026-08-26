import { IsEnum, IsISO8601, IsInt, IsOptional, IsString, Min, MaxLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

const PAYMENT_METHODS = ["BANK_TRANSFER", "CASH", "CARD", "OTHER"] as const;

export class RecordDepositReceiptDto {
  @IsISO8601()
  receivedAt!: string;

  @IsInt()
  @Min(0)
  receivedAmountMinor!: number;

  @IsEnum(PAYMENT_METHODS)
  receivedMethod!: (typeof PAYMENT_METHODS)[number];

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  receivedReference?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
