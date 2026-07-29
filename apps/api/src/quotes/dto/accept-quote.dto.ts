import { IsOptional, IsString, MaxLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

/** Staff-recorded acceptance (e.g. the customer approved verbally or by email). */
export class AcceptQuoteDto {
  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  acceptedBy?: string | null;
}
