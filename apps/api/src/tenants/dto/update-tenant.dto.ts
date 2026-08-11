import { IsNotEmpty, IsString, MaxLength } from "class-validator";

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
}
