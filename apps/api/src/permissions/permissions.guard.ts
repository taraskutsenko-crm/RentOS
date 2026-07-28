import { CanActivate, type ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { PERMISSIONS_KEY } from "./require-permissions.decorator";
import { roleHasPermission, type Permission } from "./permission";

/**
 * Enforces @RequirePermissions(...) metadata against the current tenant
 * membership's role. Must run after TenantGuard on the same route (which
 * populates request.tenant) — apply as
 * `@UseGuards(TenantGuard, PermissionsGuard)` at the controller or route
 * level, not as a global guard (global guards run before controller-level
 * ones, so request.tenant would not yet be populated).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const role = request.tenant?.membership.role;

    if (!role || !required.every((permission) => roleHasPermission(role, permission))) {
      throw new ForbiddenException("You do not have permission to perform this action");
    }

    return true;
  }
}
