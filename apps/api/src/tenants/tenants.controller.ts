import { Body, Controller, Get, Patch, Post, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnv } from "@rentos/shared";
import type { Response } from "express";

import { TENANT_COOKIE, tenantCookieOptions } from "../auth/cookie.util";
import {
  CurrentTenant,
  type CurrentTenantContext,
} from "../auth/decorators/current-tenant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PermissionsGuard } from "../permissions/permissions.guard";
import { RequirePermissions } from "../permissions/require-permissions.decorator";
import type { PublicUser } from "../users/user.mapper";
import { UpdateTenantDto } from "./dto/update-tenant.dto";
import { TenantGuard } from "./tenant.guard";
import { TenantsService } from "./tenants.service";

@Controller("tenants")
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly configService: ConfigService<ApiEnv, true>,
  ) {}

  /** Only tenants where the current user has an ACTIVE membership. */
  @Get()
  async list(@CurrentUser() user: PublicUser) {
    const tenants = await this.tenantsService.listForUser(user.id);
    return { tenants };
  }

  /** TenantGuard has already verified active membership before this runs. */
  @UseGuards(TenantGuard)
  @Post(":tenantId/select")
  select(
    @CurrentTenant() context: CurrentTenantContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.cookie(TENANT_COOKIE, context.tenant.id, tenantCookieOptions(this.configService));
    return { tenant: context.tenant, role: context.membership.role };
  }

  @UseGuards(TenantGuard)
  @Get(":tenantId")
  get(@CurrentTenant() context: CurrentTenantContext) {
    return { tenant: context.tenant, role: context.membership.role };
  }

  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermissions("tenant.manage")
  @Patch(":tenantId")
  async update(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Body() dto: UpdateTenantDto,
  ) {
    const updated = await this.tenantsService.update(tenant.id, user.id, dto);
    return { tenant: updated };
  }
}
