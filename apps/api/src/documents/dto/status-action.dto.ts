import { IsOptional, IsString, MaxLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

/** Shared body for every staff-initiated status transition — every action accepts an optional reason. */
export class StatusActionDto {
  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}
