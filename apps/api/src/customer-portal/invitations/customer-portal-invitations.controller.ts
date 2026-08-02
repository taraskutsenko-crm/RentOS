import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";

import {
  CurrentTenant,
  type CurrentTenantContext,
} from "../../auth/decorators/current-tenant.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { PermissionsGuard } from "../../permissions/permissions.guard";
import { RequirePermissions } from "../../permissions/require-permissions.decorator";
import { TenantGuard } from "../../tenants/tenant.guard";
import type { PublicUser } from "../../users/user.mapper";
import { InviteCustomerDto } from "../dto/invite-customer.dto";
import { CustomerPortalInvitationsService } from "./customer-portal-invitations.service";

@UseGuards(TenantGuard, PermissionsGuard)
@RequirePermissions("customers.portal.manage")
@Controller("tenants/:tenantId/customers/:customerId/portal")
export class CustomerPortalInvitationsController {
  constructor(private readonly invitationsService: CustomerPortalInvitationsService) {}

  @Post("invite")
  invite(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("customerId") customerId: string,
    @Body() dto: InviteCustomerDto,
  ) {
    return this.invitationsService.invite(tenant.id, customerId, user.id, dto);
  }

  @Post("revoke")
  revoke(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("customerId") customerId: string,
  ) {
    return this.invitationsService.revoke(tenant.id, customerId, user.id);
  }

  @Get("status")
  status(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("customerId") customerId: string,
  ) {
    return this.invitationsService.status(tenant.id, customerId);
  }
}
