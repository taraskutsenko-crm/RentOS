import { InvoiceStatus, InvoiceType } from "@prisma/client";
import { Type } from "class-transformer";
import {
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

export const INVOICE_SORTABLE_FIELDS = [
  "invoiceNumber",
  "issueDate",
  "dueDate",
  "createdAt",
  "totalMinor",
  "status",
] as const;
export type InvoiceSortableField = (typeof INVOICE_SORTABLE_FIELDS)[number];

export class QueryInvoicesDto {
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

  /** Matches against invoiceNumber, and the customer's first/last name/company. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsEnum(InvoiceType)
  type?: InvoiceType;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  rentalId?: string;

  @IsOptional()
  @IsDateString()
  issueDateFrom?: string;

  @IsOptional()
  @IsDateString()
  issueDateTo?: string;

  @IsOptional()
  @IsDateString()
  dueDateFrom?: string;

  @IsOptional()
  @IsDateString()
  dueDateTo?: string;

  @IsOptional()
  @IsIn(INVOICE_SORTABLE_FIELDS)
  sortBy?: InvoiceSortableField = "createdAt";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortDirection?: "asc" | "desc" = "desc";
}
