import { QuoteDiscountType } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
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
import { QuoteItemDto } from "./quote-item.dto";

export class CreateQuoteDto {
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsDateString()
  validUntil!: string;

  @IsDateString()
  plannedStart!: string;

  @IsDateString()
  plannedEnd!: string;

  /** Defaults to the tenant's default currency when omitted. */
  @IsOptional()
  @IsSupportedCurrency()
  currency?: string;

  @IsOptional()
  @IsEnum(QuoteDiscountType)
  discountType?: QuoteDiscountType;

  @IsOptional()
  @IsInt()
  @Min(0)
  discountValue?: number;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customerNotes?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  termsAndConditions?: string | null;

  /** A Quote may be created empty (DRAFT) and have items added via PATCH before sending. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items?: QuoteItemDto[];
}
