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

export class CreateRentalDto {
  @IsUUID()
  customerId!: string;

  /** A real instant — the frontend converts the tenant-local wall-clock reading via `tenantLocalToUtc` before sending (see docs/DECISIONS.md D-115). */
  @IsUnambiguousInstant()
  plannedStart!: string;

  @IsUnambiguousInstant()
  plannedEnd!: string;

  /** Defaults to the tenant's default currency when omitted. */
  @IsOptional()
  @IsSupportedCurrency()
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  discountMinor?: number;

  // Deliberately no `taxMinor` here — tax is entered as a rate on each
  // RentalItem (`taxRateBp`), never a pre-calculated flat amount the
  // client would have to compute itself; the server always derives and
  // stores the authoritative `Rental.taxMinor` aggregate (see
  // docs/DECISIONS.md, rental tax percentage model).

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
