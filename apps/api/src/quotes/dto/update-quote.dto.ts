import { QuoteDiscountType } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
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
import { IsUnambiguousInstant } from "../../common/is-unambiguous-instant.decorator";
import { QuoteItemDto } from "./quote-item.dto";

export class UpdateQuoteDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUnambiguousInstant()
  issueDate?: string;

  @IsOptional()
  @IsUnambiguousInstant()
  validUntil?: string;

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

  /** When provided, replaces the entire item list. Only allowed while status is DRAFT. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items?: QuoteItemDto[];
}
