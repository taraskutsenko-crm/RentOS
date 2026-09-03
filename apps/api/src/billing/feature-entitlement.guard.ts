import { CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { EntitlementsService } from "./entitlements.service";
import type { HavelioFeature } from "./plan-config";
import { REQUIRE_FEATURE_KEY } from "./require-feature.decorator";

/**
 * Enforces @RequireFeature(...) metadata against the current tenant's
 * Havelio subscription (never RENTAL FINANCE, never RBAC — see
 * EntitlementsService's own doc comment). Must run after TenantGuard on the
 * same route (which populates `request.tenant`) — apply as
 * `@UseGuards(TenantGuard, PermissionsGuard, FeatureEntitlementGuard)`.
 *
 * On denial, EntitlementsService.requireFeature throws
 * EntitlementDeniedException — a real, human-readable `message` plus a
 * structured `{code: "ENTITLEMENT_DENIED", reason}` body (never a generic
 * 403) — this guard does not catch or reshape it.
 */
@Injectable()
export class FeatureEntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<HavelioFeature | undefined>(REQUIRE_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!feature) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const tenantId = request.tenant?.tenant.id;
    if (!tenantId) {
      // TenantGuard would already have thrown before this guard runs on
      // any route that actually needs a tenant — nothing to enforce here.
      return true;
    }

    await this.entitlementsService.requireFeature(tenantId, feature);
    return true;
  }
}
