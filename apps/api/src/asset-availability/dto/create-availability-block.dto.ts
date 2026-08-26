import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

const BLOCK_TYPES = ["MAINTENANCE", "REPAIR", "INSPECTION", "RELOCATION", "MANUAL_BLOCK"] as const;

export class CreateAvailabilityBlockDto {
  @IsEnum(BLOCK_TYPES)
  type!: (typeof BLOCK_TYPES)[number];

  @IsDateString()
  startAt!: string;

  @IsDateString()
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
