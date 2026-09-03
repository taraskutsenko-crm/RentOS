import { IsInt, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

export class CreateAffiliateCampaignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  /** Referral-link identifier — `havelio.net/signup?ref=<slug>`. URL-safe: lowercase letters, digits, hyphens. */
  @IsString()
  @Matches(/^[a-z0-9-]{2,64}$/, {
    message: "slug must be 2-64 characters of lowercase letters, digits, and hyphens",
  })
  slug!: string;

  @IsInt()
  @Min(0)
  @Max(10000)
  commissionRateBp!: number;

  @IsInt()
  @Min(1)
  @Max(60)
  commissionDurationMonths!: number;
}
