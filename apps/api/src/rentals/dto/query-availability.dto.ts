import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsUUID,
} from "class-validator";

export class QueryAvailabilityDto {
  /** Comma-separated asset ids, e.g. ?assetIds=uuid1,uuid2 */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.split(",").filter(Boolean) : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  assetIds!: string[];

  @IsDateString()
  plannedStart!: string;

  @IsDateString()
  plannedEnd!: string;

  @IsOptional()
  @IsUUID()
  excludeRentalId?: string;
}
