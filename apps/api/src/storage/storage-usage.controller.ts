import { Controller, Get, UseGuards } from "@nestjs/common";

import { CurrentTenant, type CurrentTenantContext } from "../auth/decorators/current-tenant.decorator";
import { PermissionsGuard } from "../permissions/permissions.guard";
import { RequirePermissions } from "../permissions/require-permissions.decorator";
import { TenantGuard } from "../tenants/tenant.guard";
import { StorageUsageService } from "./storage-usage.service";

@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/storage")
export class StorageUsageController {
  constructor(private readonly storageUsageService: StorageUsageService) {}

  /** Gated the same as e-invoice connection status (integrations.view) — infrastructure/ops visibility, not everyday-staff information. */
  @RequirePermissions("integrations.view")
  @Get("usage")
  getUsage(@CurrentTenant() { tenant }: CurrentTenantContext) {
    return this.storageUsageService.getUsage(tenant.id);
  }
}
