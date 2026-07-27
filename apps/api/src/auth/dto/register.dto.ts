import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from "class-validator";

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

  @IsString()
  @MinLength(2)
  @MaxLength(10)
  defaultLanguage!: string;

  @IsString()
  @Length(3, 3)
  defaultCurrency!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  timezone!: string;
}
