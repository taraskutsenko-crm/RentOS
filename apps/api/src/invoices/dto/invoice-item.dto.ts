import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

export class InvoiceItemDto {
  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity?: number;

  /** Free-text display label only (e.g. "day", "piece", "km") — never used in pricing. */
  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string | null;

  @IsInt()
  @Min(0)
  unitNetPriceMinor!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  discountMinor?: number;

  /** Integer basis points (2300 = 23.00%) — never a float rate. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  taxRateBp?: number;

  /** Traceability back to the RentalItem a "create from Rental" prefill copied this line from. */
  @IsOptional()
  @IsUUID()
  sourceRentalItemId?: string;
}
