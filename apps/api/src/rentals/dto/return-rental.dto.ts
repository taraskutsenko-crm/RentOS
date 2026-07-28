import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

export class ReturnRentalDto {
  /** Omit to return every not-yet-returned item (a full return). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  itemIds?: string[];

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}
