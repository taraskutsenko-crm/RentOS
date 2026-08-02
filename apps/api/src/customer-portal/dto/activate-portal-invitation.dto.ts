import { IsString, Matches, MaxLength, MinLength } from "class-validator";

/** Same password strength rule as staff registration (auth/dto/register.dto.ts). */
export class ActivatePortalInvitationDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @MinLength(12, { message: "Password must be at least 12 characters long" })
  @MaxLength(128)
  @Matches(/[a-z]/, { message: "Password must contain a lowercase letter" })
  @Matches(/[A-Z]/, { message: "Password must contain an uppercase letter" })
  @Matches(/[0-9]/, { message: "Password must contain a number" })
  password!: string;
}
