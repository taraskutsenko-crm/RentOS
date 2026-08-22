import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import { EmptyToNull } from "../../common/empty-to-null.transform";
import { IsSupportedCurrency } from "../../common/is-supported-currency.decorator";

export class CreateCompanyBankAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  label!: string;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  bankName?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  accountHolder?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  accountNumber?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  iban?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  swiftBic?: string | null;

  @IsSupportedCurrency()
  currency!: string;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bankAddress?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentReference?: string | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
