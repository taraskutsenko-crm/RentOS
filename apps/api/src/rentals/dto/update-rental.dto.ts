import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
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
import { IsUnambiguousInstant } from "../../common/is-unambiguous-instant.decorator";
import { RentalItemDto } from "./rental-item.dto";

export class UpdateRentalDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUnambiguousInstant()
  plannedStart?: string;

  @IsOptional()
  @IsUnambiguousInstant()
  plannedEnd?: string;

  @IsOptional()
  @IsSupportedCurrency()
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  discountMinor?: number;

  // Deliberately no `taxMinor` — see CreateRentalDto's identical note.

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

  /** When provided, replaces the entire item list. Only allowed while status is DRAFT or QUOTE. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RentalItemDto)
  items?: RentalItemDto[];
}
