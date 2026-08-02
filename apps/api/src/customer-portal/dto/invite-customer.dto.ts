import { IsEmail, IsOptional } from "class-validator";

/**
 * Defaults to the Customer's own `email` column when omitted; only
 * provided to let staff redirect the invite to a different address
 * (e.g. the customer's email on file is stale).
 */
export class InviteCustomerDto {
  @IsOptional()
  @IsEmail()
  email?: string;
}
