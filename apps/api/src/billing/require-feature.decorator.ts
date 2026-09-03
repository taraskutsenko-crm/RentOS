import { SetMetadata } from "@nestjs/common";

import type { HavelioFeature } from "./plan-config";

export const REQUIRE_FEATURE_KEY = "requireHavelioFeature";

/**
 * Restricts a tenant-scoped route to tenants whose Havelio plan includes
 * `feature` (see plan-config.ts's own `HavelioFeature`/`PLAN_DEFINITIONS`).
 * Requires TenantGuard to have run first (populates `request.tenant`) and
 * FeatureEntitlementGuard to run after it — e.g.
 * `@UseGuards(TenantGuard, PermissionsGuard, FeatureEntitlementGuard)`.
 *
 * This is the ONE place a controller ever names a Havelio feature — never
 * a scattered `if (plan === "BUSINESS")` check (see docs/DECISIONS.md).
 * Distinct from `@RequirePermissions`: that gates by tenant RBAC (does
 * this membership role allow the action at all), this gates by Havelio
 * subscription entitlement (does this tenant's PLAN allow the feature at
 * all) — a caller must satisfy BOTH, independently.
 */
export const RequireFeature = (feature: HavelioFeature): ReturnType<typeof SetMetadata> =>
  SetMetadata(REQUIRE_FEATURE_KEY, feature);
