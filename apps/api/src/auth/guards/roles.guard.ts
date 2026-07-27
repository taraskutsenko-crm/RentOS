import { CanActivate, type ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { MembershipRole } from "@prisma/client";
import type { Request } from "express";

import { ROLES_KEY } from "../decorators/roles.decorator";

/**
 * Registered globally (see AuthModule). A no-op unless the route carries
 * @Roles(...) metadata, in which case it requires TenantGuard to have
 * already populated request.tenant.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<MembershipRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const role = request.tenant?.membership.role;

    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException("You do not have permission to perform this action");
    }

    return true;
  }
}
