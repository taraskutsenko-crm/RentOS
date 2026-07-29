import { IsOptional, IsString, MaxLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

/** Body for the public, token-authenticated reject action. */
export class PublicRejectQuoteDto {
  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;
}
