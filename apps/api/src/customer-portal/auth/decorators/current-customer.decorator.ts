import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

import type { PublicCustomer } from "../../common/public-customer.mapper";

/** The authenticated customer, as attached by CustomerAuthGuard. */
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PublicCustomer => {
    const request = ctx.switchToHttp().getRequest<Request>();
    if (!request.portalCustomer) {
      throw new Error("CurrentCustomer decorator used outside of a portal-authenticated route");
    }
    return request.portalCustomer;
  },
);
