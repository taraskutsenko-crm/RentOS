import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

export const RECEIVABLES_SORTABLE_FIELDS = [
  "issueDate",
  "dueDate",
  "totalMinor",
  "outstandingMinor",
  "overdueDays",
] as const;
export type ReceivablesSortableField = (typeof RECEIVABLES_SORTABLE_FIELDS)[number];

/**
 * Open-receivables drill-down (docs/PRODUCT_BIBLE.md Financial Reports §24)
 * — deliberately period-agnostic (a receivable is always a current
 * snapshot, see docs/DECISIONS.md), but supports the same currency/
 * customer filters as the rest of the module plus its own status/search.
 */
export class ReceivablesTableQueryDto {
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
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  /** Matches against invoiceNumber and the customer's name/company. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(RECEIVABLES_SORTABLE_FIELDS)
  sortBy?: ReceivablesSortableField = "dueDate";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortDirection?: "asc" | "desc" = "asc";
}
