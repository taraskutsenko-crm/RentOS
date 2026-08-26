import { IsISO8601, IsInt, IsOptional, IsString, Min, MaxLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

export class RecordDepositReturnDto {
  @IsISO8601()
  returnedAt!: string;

  @IsInt()
  @Min(0)
  returnedAmountMinor!: number;

  @IsInt()
  @Min(0)
  retainedAmountMinor!: number;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  retentionReason?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
