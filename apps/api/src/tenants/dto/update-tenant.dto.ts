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
   * for transactional email (see tenant-sender-identity.util.ts). Genuinely
   * optional, unlike the other identity fields above: empty string, `null`,
   * and an entirely omitted field are all treated as "no company email" and
   * skip every validator below (`@ValidateIf` gates the whole property, not
   * just the decorators declared after it) — a client that doesn't yet know
   * about this field must never be blocked from saving the rest of the
   * Company Profile. A non-empty value must still be a real, bounded email.
   */
  @ValidateIf(
    (dto: UpdateTenantDto) => dto.email !== undefined && dto.email !== null && dto.email !== "",
  )
  @IsString()
  @MaxLength(320)
  @IsEmail()
  email?: string | null;
}
