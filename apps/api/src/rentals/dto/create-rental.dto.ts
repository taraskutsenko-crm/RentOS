import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  ValidateNested,
} from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";
import { IsSupportedCurrency } from "../../common/is-supported-currency.decorator";
import { RentalItemDto } from "./rental-item.dto";

export class CreateRentalDto {
  @IsUUID()
  customerId!: string;

  @IsDateString()
  plannedStart!: string;

  @IsDateString()
  plannedEnd!: string;

  /** Defaults to the tenant's default currency when omitted. */
  @IsOptional()
  @IsSupportedCurrency()
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  discountMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  taxMinor?: number;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string | null;

  /** A Rental may be created empty (DRAFT) and have items added via PATCH before reserving. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RentalItemDto)
  items?: RentalItemDto[];
}
