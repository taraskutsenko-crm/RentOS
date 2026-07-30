import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";

import {
  CurrentTenant,
  type CurrentTenantContext,
} from "../auth/decorators/current-tenant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PermissionsGuard } from "../permissions/permissions.guard";
import { RequirePermissions } from "../permissions/require-permissions.decorator";
import { TenantGuard } from "../tenants/tenant.guard";
import type { PublicUser } from "../users/user.mapper";
import { UpdateRentalBillingSettingsDto } from "./dto/update-rental-billing-settings.dto";
import { RentalBillingSettingsService } from "./rental-billing-settings.service";

@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/rental-billing-settings")
export class RentalBillingSettingsController {
  constructor(private readonly rentalBillingSettingsService: RentalBillingSettingsService) {}

  @RequirePermissions("rental_settings.view")
  @Get()
  get(@CurrentTenant() { tenant }: CurrentTenantContext) {
    return this.rentalBillingSettingsService.getView(tenant.id);
  }

  @RequirePermissions("rental_settings.manage")
  @Patch()
  update(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Body() dto: UpdateRentalBillingSettingsDto,
  ) {
    return this.rentalBillingSettingsService.update(tenant.id, user.id, dto);
  }
}
