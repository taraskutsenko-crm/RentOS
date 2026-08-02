import { RentalStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

import {
  RENTAL_SORTABLE_FIELDS,
  type RentalSortableField,
} from "../../rentals/dto/query-rentals.dto";

/**
 * Mirrors QueryRentalsDto minus `customerId`/`search`-across-other-customers
 * concerns — a portal caller is always scoped to their own customerId,
 * forced server-side in PortalRentalsService, never accepted from the
 * client.
 */
export class QueryPortalRentalsDto {
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
  @IsEnum(RentalStatus)
  status?: RentalStatus;

  @IsOptional()
  @IsIn(RENTAL_SORTABLE_FIELDS)
  sortBy?: RentalSortableField = "plannedStart";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortDirection?: "asc" | "desc" = "desc";
}
