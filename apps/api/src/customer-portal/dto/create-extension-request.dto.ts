import { IsOptional, IsString, MaxLength } from "class-validator";

import { IsUnambiguousInstant } from "../../common/is-unambiguous-instant.decorator";

export class CreateExtensionRequestDto {
  @IsUnambiguousInstant()
  requestedEnd!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
