import { IsInt, IsOptional, IsString, Min, MaxLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";
import { IsUnambiguousInstant } from "../../common/is-unambiguous-instant.decorator";

export class RecordDepositReturnDto {
  @IsUnambiguousInstant()
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
