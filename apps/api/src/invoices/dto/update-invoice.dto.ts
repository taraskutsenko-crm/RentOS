import { PaymentMethod } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";
import { IsSupportedCurrency } from "../../common/is-supported-currency.decorator";
import { InvoiceItemDto } from "./invoice-item.dto";

/**
 * Edits a DRAFT invoice — rejected once the invoice has left DRAFT (see
 * InvoicesService.update, "an issued invoice must not be casually edited
 * like a Draft"). `items`, when present, fully replaces the invoice's line
 * items (mirrors UpdateQuoteDto's items-replace semantics).
 */
export class UpdateInvoiceDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  saleDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsSupportedCurrency()
  currency?: string;

  @EmptyToNull()
  @IsOptional()
  @IsUUID()
  bankAccountId?: string | null;

  @IsOptional()
  @IsEnum(PaymentMethod)
  preferredPaymentMethod?: PaymentMethod;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentReference?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items?: InvoiceItemDto[];
}
