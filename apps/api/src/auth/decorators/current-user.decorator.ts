import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

import type { PublicUser } from "../../users/user.mapper";

/** The authenticated user, as attached by JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PublicUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    if (!request.user) {
      throw new Error("CurrentUser decorator used outside of an authenticated route");
    }
    return request.user;
  },
);
