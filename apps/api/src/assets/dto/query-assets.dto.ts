import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export const ASSET_SORTABLE_FIELDS = [
  "name",
  "internalNumber",
  "manufacturer",
  "model",
  "createdAt",
  "updatedAt",
  "purchaseDate",
] as const;
export type AssetSortableField = (typeof ASSET_SORTABLE_FIELDS)[number];

export class QueryAssetsDto {
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

  /** Matches against name, internalNumber, sku, serialNumber, barcode, manufacturer, model, and searchable custom fields. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  statusId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === "true" || value === true)
  @IsBoolean()
  isRentable?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === "true" || value === true)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  manufacturer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  internalNumber?: string;

  @IsOptional()
  @IsIn(ASSET_SORTABLE_FIELDS)
  sortBy?: AssetSortableField = "createdAt";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortDirection?: "asc" | "desc" = "desc";

  /** JSON-encoded object of { [fieldKey]: value }, restricted to filterable custom field definitions. */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  customFields?: string;
}
