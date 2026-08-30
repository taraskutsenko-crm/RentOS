import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsUUID } from "class-validator";

import { IsUnambiguousInstant } from "../../common/is-unambiguous-instant.decorator";

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

  @IsUnambiguousInstant()
  plannedStart!: string;

  @IsUnambiguousInstant()
  plannedEnd!: string;

  @IsOptional()
  @IsUUID()
  excludeRentalId?: string;
}
