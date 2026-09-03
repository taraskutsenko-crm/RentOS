import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnv } from "@rentos/shared";

import { CurrentTenant, type CurrentTenantContext } from "../auth/decorators/current-tenant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { PermissionsGuard } from "../permissions/permissions.guard";
import { RequirePermissions } from "../permissions/require-permissions.decorator";
import { TenantGuard } from "../tenants/tenant.guard";
import type { PublicUser } from "../users/user.mapper";
import { ChangePlanDto } from "./dto/change-plan.dto";
import { CreateCheckoutSessionDto } from "./dto/create-checkout-session.dto";
import { EntitlementsService } from "./entitlements.service";
import { ORDERED_PLANS, PLAN_DEFINITIONS } from "./plan-config";
import { PromoCodesService } from "./promo-codes.service";
import { SubscriptionsService } from "./subscriptions.service";

/**
 * Havelio Billing (Stage 17) — the tenant's own subscription to Havelio
 * itself. Never confuse with `/tenants/:tenantId/invoices` or
 * `/tenants/:tenantId/payments` (RENTAL FINANCE — money the tenant's own
 * customers pay the tenant); this controller is the entire surface for
 * HAVELIO BILLING.
 *
 * `GET plans` is intentionally `@Public()` — the plan list/pricing must be
 * visible on a public pricing page and during signup, before any tenant
 * context exists.
 */
@Controller()
export class BillingController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly entitlementsService: EntitlementsService,
    private readonly promoCodesService: PromoCodesService,
    private readonly configService: ConfigService<ApiEnv, true>,
  ) {}

  @Public()
  @Get("billing/plans")
  listPlans() {
    return {
      plans: ORDERED_PLANS.map((plan) => PLAN_DEFINITIONS[plan]),
      stripeConfigured: this.subscriptionsService.isStripeConfigured(),
    };
  }

  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermissions("billing.view")
  @Get("tenants/:tenantId/billing/subscription")
  async getSubscription(@CurrentTenant() { tenant }: CurrentTenantContext) {
    const state = await this.entitlementsService.getEntitlementState(tenant.id);
    const usage = {
      assets: await this.entitlementsService.countActiveAssets(tenant.id),
      users: await this.entitlementsService.countActiveUsers(tenant.id),
    };
    return {
      subscription: state.subscription,
      access: state.access,
      plan: state.plan,
      usage,
      stripeConfigured: this.subscriptionsService.isStripeConfigured(),
    };
  }

  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermissions("billing.manage")
  @Post("tenants/:tenantId/billing/checkout")
  async createCheckoutSession(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    const webOrigin = this.configService.get("WEB_ORIGIN", { infer: true });
    const successUrl = `${webOrigin}/app/settings/billing?checkout=success`;
    const cancelUrl = `${webOrigin}/app/settings/billing?checkout=canceled`;

    return this.subscriptionsService.createCheckoutSession(
      tenant.id,
      user.id,
      dto.plan,
      dto.interval,
      tenant.email ?? user.email,
      successUrl,
      cancelUrl,
      dto.promoCode,
    );
  }

  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermissions("billing.manage")
  @Post("tenants/:tenantId/billing/portal")
  async createBillingPortalSession(@CurrentTenant() { tenant }: CurrentTenantContext) {
    const webOrigin = this.configService.get("WEB_ORIGIN", { infer: true });
    return this.subscriptionsService.createBillingPortalSession(
      tenant.id,
      `${webOrigin}/app/settings/billing`,
    );
  }

  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermissions("billing.manage")
  @Post("tenants/:tenantId/billing/cancel")
  async cancel(@CurrentTenant() { tenant }: CurrentTenantContext, @CurrentUser() user: PublicUser) {
    return this.subscriptionsService.cancelAtPeriodEnd(tenant.id, user.id);
  }

  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermissions("billing.manage")
  @Post("tenants/:tenantId/billing/resume")
  async resume(@CurrentTenant() { tenant }: CurrentTenantContext, @CurrentUser() user: PublicUser) {
    return this.subscriptionsService.resumeSubscription(tenant.id, user.id);
  }

  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermissions("billing.manage")
  @Post("tenants/:tenantId/billing/change-plan")
  async changePlan(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Body() dto: ChangePlanDto,
  ) {
    return this.subscriptionsService.changePlan(tenant.id, user.id, dto.plan, dto.interval);
  }

  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermissions("billing.manage")
  @Get("tenants/:tenantId/billing/promo-code/:code/preview")
  async previewPromoCode(
    @Param("code") code: string,
    @Query("plan") plan: "STARTER" | "BUSINESS" | "PROFESSIONAL",
    @Query("interval") interval: "MONTHLY" | "ANNUAL",
  ) {
    return this.promoCodesService.previewDiscount(code, plan, interval);
  }
}
