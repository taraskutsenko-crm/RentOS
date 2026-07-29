import { IsOptional, IsString, MaxLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

/** Body for the public, token-authenticated accept action — no session, so the customer may identify themselves. */
export class PublicAcceptQuoteDto {
  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  acceptedBy?: string | null;
}
