import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";

import {
  CurrentTenant,
  type CurrentTenantContext,
} from "../../auth/decorators/current-tenant.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { FeatureEntitlementGuard } from "../../billing/feature-entitlement.guard";
import { RequireFeature } from "../../billing/require-feature.decorator";
import { PermissionsGuard } from "../../permissions/permissions.guard";
import { RequirePermissions } from "../../permissions/require-permissions.decorator";
import { TenantGuard } from "../../tenants/tenant.guard";
import type { PublicUser } from "../../users/user.mapper";
import { InviteCustomerDto } from "../dto/invite-customer.dto";
import { CustomerPortalInvitationsService } from "./customer-portal-invitations.service";

/**
 * Havelio Billing (Stage 17 closure pass) — inviting a NEW customer to the
 * portal requires the CUSTOMER_PORTAL feature (Business+); `revoke` and
 * `status` are never feature-gated — revoking access must always be
 * possible, and an already-invited customer's own portal-side session
 * (CustomerAuthGuard, an entirely separate authorization path) is
 * unaffected by the tenant's Havelio plan (see docs/DECISIONS.md
 * "existing records must remain safe").
 */
@UseGuards(TenantGuard, PermissionsGuard, FeatureEntitlementGuard)
@RequirePermissions("customers.portal.manage")
@Controller("tenants/:tenantId/customers/:customerId/portal")
export class CustomerPortalInvitationsController {
  constructor(private readonly invitationsService: CustomerPortalInvitationsService) {}

  @RequireFeature("CUSTOMER_PORTAL")
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
