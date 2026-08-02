import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

/**
 * A Customer's email is optional and not unique per tenant (see
 * Customer.email's schema doc comment), so login alone can't be
 * "email + password" the way staff login is — the tenant is identified by
 * its slug, exactly as a portal URL like app.havelio.net/portal/acme would
 * imply in a subdomain-per-tenant deployment.
 */
export class PortalLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  tenantSlug!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
