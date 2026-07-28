import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  MinLength,
} from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";
import { IsSupportedCurrency } from "../../common/is-supported-currency.decorator";

export class CreateAssetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  internalNumber!: string;

  @IsUUID()
  categoryId!: string;

  /** Defaults to the tenant's AVAILABLE system status when omitted. */
  @IsOptional()
  @IsUUID()
  statusId?: string;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  qrCodeValue?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  manufacturer?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  model?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsDateString()
  purchaseDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  purchasePriceMinor?: number;

  @EmptyToNull()
  @IsOptional()
  @IsSupportedCurrency()
  purchaseCurrency?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  replacementValueMinor?: number;

  @EmptyToNull()
  @IsOptional()
  @IsSupportedCurrency()
  replacementCurrency?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  currentLocationText?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  conditionNotes?: string | null;

  @IsOptional()
  @IsBoolean()
  isRentable?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Keyed by AssetCustomFieldDefinition.key, not id. */
  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}
