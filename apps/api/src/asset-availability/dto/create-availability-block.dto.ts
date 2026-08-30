import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";
import { IsUnambiguousInstant } from "../../common/is-unambiguous-instant.decorator";

const BLOCK_TYPES = ["MAINTENANCE", "REPAIR", "INSPECTION", "RELOCATION", "MANUAL_BLOCK"] as const;

export class CreateAvailabilityBlockDto {
  @IsEnum(BLOCK_TYPES)
  type!: (typeof BLOCK_TYPES)[number];

  @IsUnambiguousInstant()
  startAt!: string;

  @IsUnambiguousInstant()
  endAt!: string;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  /** Optionally links a REPAIR block created from a Return Protocol back to the rental that surfaced the damage. */
  @IsOptional()
  @IsUUID()
  relatedRentalId?: string;
}
