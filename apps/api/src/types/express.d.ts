import type { Tenant, TenantMembership } from "@prisma/client";

import type { PublicUser } from "../users/user.mapper";

declare global {
  namespace Express {
    interface Request {
      user?: PublicUser;
      tenant?: { tenant: Tenant; membership: TenantMembership };
    }
  }
}

export {};
