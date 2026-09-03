import { IsIn, IsInt, IsISO8601, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class RecordPayoutDto {
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsString()
  @MaxLength(3)
  currency!: string;

  @IsISO8601()
  payoutDate!: string;

  @IsIn(["BANK_TRANSFER", "PAYPAL", "OTHER"])
  method!: "BANK_TRANSFER" | "PAYPAL" | "OTHER";

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
