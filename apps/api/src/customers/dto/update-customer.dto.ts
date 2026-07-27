import { CustomerStatus } from "@prisma/client";
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  vatNumber?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;
}
