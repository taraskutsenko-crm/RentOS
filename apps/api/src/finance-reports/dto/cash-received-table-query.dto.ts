import { PaymentMethod } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

import { FinanceReportQueryDto } from "./finance-report-query.dto";

export const CASH_RECEIVED_SORTABLE_FIELDS = ["paymentDate", "amountMinor"] as const;
export type CashReceivedSortableField = (typeof CASH_RECEIVED_SORTABLE_FIELDS)[number];

/** Payment transaction drill-down (docs/PRODUCT_BIBLE.md Financial Reports §25) — period-scoped like the rest of the module (a payment "happened" on its paymentDate), plus its own customer/method/search filters. */
export class CashReceivedTableQueryDto extends FinanceReportQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  /** Matches against the invoice number and the customer's name/company. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(CASH_RECEIVED_SORTABLE_FIELDS)
  sortBy?: CashReceivedSortableField = "paymentDate";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortDirection?: "asc" | "desc" = "desc";
}
