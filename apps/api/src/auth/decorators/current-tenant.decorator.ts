import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Tenant, TenantMembership } from "@prisma/client";
import type { Request } from "express";

export interface CurrentTenantContext {
  tenant: Tenant;
  membership: TenantMembership;
}

/** The verified active-tenant context, as attached by TenantGuard. */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentTenantContext => {
    const request = ctx.switchToHttp().getRequest<Request>();
    if (!request.tenant) {
      throw new Error("CurrentTenant decorator used outside of a TenantGuard-protected route");
    }
    return request.tenant;
  },
);
