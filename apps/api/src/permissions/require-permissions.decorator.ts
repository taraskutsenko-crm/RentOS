import { SetMetadata } from "@nestjs/common";

import type { Permission } from "./permission";

export const PERMISSIONS_KEY = "permissions";

/**
 * Restricts a tenant-scoped route to callers whose membership role carries
 * every listed permission (see ROLE_PERMISSIONS). Requires TenantGuard to
 * have run first and PermissionsGuard to be applied after it — e.g.
 * `@UseGuards(TenantGuard, PermissionsGuard)`.
 */
export const RequirePermissions = (...permissions: Permission[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(PERMISSIONS_KEY, permissions);
