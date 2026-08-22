import { IsOptional, IsString, MaxLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

export class CancelInvoiceDto {
  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;
}
