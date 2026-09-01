import { RentalStatus } from "@prisma/client";
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

export const RENTAL_SORTABLE_FIELDS = [
  "rentalNumber",
  "plannedStart",
  "plannedEnd",
  "createdAt",
  "totalMinor",
] as const;
export type RentalSortableField = (typeof RENTAL_SORTABLE_FIELDS)[number];

/** Matches a RentalAttentionCategory (rental-attention.util.ts) — the Rentals list's dashboard-click-through filter, e.g. `?attention=overdue`. */
export const RENTAL_ATTENTION_FILTERS = ["overdue", "endingToday", "endingTomorrow"] as const;
export type RentalAttentionFilter = (typeof RENTAL_ATTENTION_FILTERS)[number];

export class QueryRentalsDto {
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

  /** Matches against rentalNumber, and the customer's first/last name/company. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsEnum(RentalStatus)
  status?: RentalStatus;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsDateString()
  plannedStartFrom?: string;

  @IsOptional()
  @IsDateString()
  plannedStartTo?: string;

  @IsOptional()
  @IsIn(RENTAL_ATTENTION_FILTERS)
  attention?: RentalAttentionFilter;

  @IsOptional()
  @IsIn(RENTAL_SORTABLE_FIELDS)
  sortBy?: RentalSortableField = "createdAt";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortDirection?: "asc" | "desc" = "desc";
}
