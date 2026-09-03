import { supportedLanguages } from "@rentos/localization";
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12, { message: "Password must be at least 12 characters long" })
  @MaxLength(128)
  @Matches(/[a-z]/, { message: "Password must contain a lowercase letter" })
  @Matches(/[A-Z]/, { message: "Password must contain an uppercase letter" })
  @Matches(/[0-9]/, { message: "Password must contain a number" })
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  companyName!: string;

  @IsString()
  @Length(2, 2)
  countryCode!: string;

  @IsIn(supportedLanguages, {
    message: `defaultLanguage must be one of: ${supportedLanguages.join(", ")}`,
  })
  defaultLanguage!: string;

  @IsString()
  @Length(3, 3)
  defaultCurrency!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  timezone!: string;

  /**
   * Havelio Affiliate/Partner attribution (Stage 17) — either a human
   * promotion code (e.g. "RENTAL20") or a referral-campaign slug (e.g.
   * "rentalpro", from `?ref=rentalpro`). Optional: most tenants register
   * with neither. See AffiliateAttributionService.recordFromSignup — a
   * value here that doesn't match anything is silently ignored (never
   * blocks registration), matching a plain marketing code with no
   * affiliate behind it.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  affiliateCode?: string;
}
