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

export class CreateQuoteDto {
  @IsUUID()
  customerId!: string;

  /**
   * A real instant (`new Date()` at creation) when omitted, which is what
   * every real caller does today — no frontend field sets this explicitly.
   * Validated the same as the tenant-local-derived fields below in case a
   * caller ever does supply it, for the same anti-ambiguity reason.
   */
  @IsOptional()
  @IsUnambiguousInstant()
  issueDate?: string;

  @IsUnambiguousInstant()
  validUntil!: string;

  @IsUnambiguousInstant()
  plannedStart!: string;

  @IsUnambiguousInstant()
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
