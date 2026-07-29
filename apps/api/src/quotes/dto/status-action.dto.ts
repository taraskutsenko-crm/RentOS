import { IsOptional, IsString, MaxLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

/** Shared body for staff-initiated cancel/accept/reject — every action accepts an optional reason. */
export class StatusActionDto {
  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}
