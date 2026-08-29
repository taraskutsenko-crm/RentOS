import { IsEmail, IsNotEmpty, IsString, MaxLength, ValidateIf } from "class-validator";

/**
 * Backs `PATCH /tenants/:tenantId` (Company Profile settings). All fields
 * are required on every submit — same "always send the full form" shape as
 * UpdateRentalBillingSettingsDto — so the service can unambiguously tell
 * "field cleared" (empty string) from "field not touched" (impossible here
 * by design). Empty strings for the optional identity fields are stored as
 * null; `name` must stay non-empty.
 */
export class UpdateTenantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(100)
  registrationNumber!: string;

  @IsString()
  @MaxLength(100)
  taxNumber!: string;

  @IsString()
  @MaxLength(500)
  address!: string;

  @IsString()
  @MaxLength(50)
  phone!: string;

  /**
   * The tenant's customer-facing company email — canonical Reply-To source
   * for transactional email (see tenant-sender-identity.util.ts). Empty
   * string clears it (same convention as the other optional identity
   * fields); a non-empty value must be a syntactically valid email.
   */
  @IsString()
  @MaxLength(320)
  @ValidateIf((dto: UpdateTenantDto) => dto.email !== "")
  @IsEmail()
  email!: string;
}
