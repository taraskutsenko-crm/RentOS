import type { Tenant, TenantMembership } from "@prisma/client";

import type { PublicCustomer } from "../customer-portal/common/public-customer.mapper";
import type { PublicUser } from "../users/user.mapper";

declare global {
  namespace Express {
    interface Request {
      user?: PublicUser;
      tenant?: { tenant: Tenant; membership: TenantMembership };
      /** Set by CustomerAuthGuard on /portal/** routes — a wholly separate identity from `user`/`tenant` above. tenantId is available as `portalCustomer.tenantId`. */
      portalCustomer?: PublicCustomer;
    }
  }
}

export {};
