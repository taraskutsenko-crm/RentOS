import { IsInt, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class ManualAdjustmentDto {
  /** Signed — positive credits the partner, negative debits (see AffiliateCommissionEntry.amountMinor's own doc comment). */
  @IsInt()
  amountMinor!: number;

  @IsString()
  @MaxLength(3)
  currency!: string;

  @IsString()
  @MaxLength(1000)
  note!: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;
}
