import { SetMetadata } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";

export const ROLES_KEY = "roles";

/** Restricts a tenant-scoped route to the given membership roles. Requires TenantGuard to have run first. */
export const Roles = (...roles: MembershipRole[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(ROLES_KEY, roles);
