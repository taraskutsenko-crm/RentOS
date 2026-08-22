import { InvoiceType } from "@prisma/client";
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
 * Creates a DRAFT invoice. Two entry points, matching the task's required
 * "create from Rental with prefill" and "create standalone" flows:
 *
 *  - `rentalId` set, `items` omitted: InvoicesService prefills
 *    customer/currency/bank account/line items from the Rental (and, when
 *    the Rental has a sourceQuote, that quote's non-asset lines too — see
 *    docs/DECISIONS.md). The caller still receives an editable DRAFT, never
 *    an already-issued invoice.
 *  - `items` provided explicitly: used verbatim, `rentalId` still optional
 *    (for linking a manually-built invoice to a Rental without prefill).
 *
 * Deliberately does NOT assume one Rental = one Invoice — nothing here
 * checks or limits how many invoices already exist for a given rentalId.
 */
export class CreateInvoiceDto {
  @IsOptional()
  @IsUUID()
  rentalId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsEnum(InvoiceType)
  type?: InvoiceType;

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
