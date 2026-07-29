import { QuoteStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export const QUOTE_SORTABLE_FIELDS = [
  "quoteNumber",
  "issueDate",
  "validUntil",
  "plannedStart",
  "plannedEnd",
  "createdAt",
  "totalMinor",
] as const;
export type QuoteSortableField = (typeof QUOTE_SORTABLE_FIELDS)[number];

export class QueryQuotesDto {
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

  /** Matches against quoteNumber, and the customer's first/last name/company. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsEnum(QuoteStatus)
  status?: QuoteStatus;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  createdByUserId?: string;

  @IsOptional()
  @IsDateString()
  issueDateFrom?: string;

  @IsOptional()
  @IsDateString()
  issueDateTo?: string;

  @IsOptional()
  @IsDateString()
  validUntilFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntilTo?: string;

  @IsOptional()
  @IsDateString()
  plannedStartFrom?: string;

  @IsOptional()
  @IsDateString()
  plannedStartTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalMinorFrom?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalMinorTo?: number;

  /** true = only quotes whose validUntil has passed and are still SENT/VIEWED (expired but not yet swept). */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  expired?: boolean;

  /** true = status is CONVERTED; false = status is anything else. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  converted?: boolean;

  @IsOptional()
  @IsIn(QUOTE_SORTABLE_FIELDS)
  sortBy?: QuoteSortableField = "createdAt";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortDirection?: "asc" | "desc" = "desc";
}
