import type { Customer } from "@prisma/client";

/**
 * A Customer with portal-auth secrets removed — the only shape ever sent
 * to a client. In practice PrismaService's global `omit` config (see
 * prisma/prisma.service.ts) already strips these two columns from every
 * query that doesn't explicitly opt back in, so this mapper is mostly
 * belt-and-suspenders type safety, mirroring users/user.mapper.ts's
 * `toPublicUser` exactly.
 */
export type PublicCustomer = Omit<Customer, "portalPasswordHash" | "portalInvitationTokenHash">;

export function toPublicCustomer(customer: Customer): PublicCustomer {
  const {
    portalPasswordHash: _hash,
    portalInvitationTokenHash: _tokenHash,
    ...publicCustomer
  } = customer;
  return publicCustomer;
}
