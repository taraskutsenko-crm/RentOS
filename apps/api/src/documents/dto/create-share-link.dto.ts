import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class CreateShareLinkDto {
  /** Defaults to 30 days when omitted. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;

  /** Optional access password — hashed via PasswordService (argon2), never stored in plain text. */
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(200)
  password?: string;
}
