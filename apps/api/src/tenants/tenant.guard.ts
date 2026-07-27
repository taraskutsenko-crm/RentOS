import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

import { TENANT_COOKIE } from "../auth/cookie.util";
import { MembershipsService } from "../memberships/memberships.service";
import { TenantsService } from "./tenants.service";

/**
 * Resolves the tenant for a request from the :tenantId route param (falling
 * back to the active-tenant cookie), then verifies — against the database,
 * every time — that the current user has an ACTIVE membership in that
 * tenant. The tenantId is never trusted on its own.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly membershipsService: MembershipsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    if (!request.user) {
      throw new UnauthorizedException("Authentication required");
    }

    const tenantId =
      (request.params?.tenantId as string | undefined) ??
      (request.cookies?.[TENANT_COOKIE] as string | undefined);

    if (!tenantId) {
      throw new ForbiddenException("No tenant context provided");
    }

    const membership = await this.membershipsService.findActiveMembership(
      tenantId,
      request.user.id,
    );
    if (!membership) {
      throw new ForbiddenException("You do not have access to this tenant");
    }

    const tenant = await this.tenantsService.findById(tenantId);
    if (!tenant || tenant.deletedAt || !tenant.isActive) {
      throw new ForbiddenException("This tenant is not available");
    }

    request.tenant = { tenant, membership };
    return true;
  }
}
