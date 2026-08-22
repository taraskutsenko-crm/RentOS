import { Body, Controller, Get, Param, ParseEnumPipe, Post, UseGuards } from "@nestjs/common";
import { EInvoiceProviderType } from "@prisma/client";

import {
  CurrentTenant,
  type CurrentTenantContext,
} from "../auth/decorators/current-tenant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PermissionsGuard } from "../permissions/permissions.guard";
import { RequirePermissions } from "../permissions/require-permissions.decorator";
import { TenantGuard } from "../tenants/tenant.guard";
import type { PublicUser } from "../users/user.mapper";
import { ConnectEInvoiceDto } from "./dto/connect-einvoice.dto";
import { EInvoiceConnectionsService } from "./einvoice-connections.service";

@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/einvoice-connections")
export class EInvoiceConnectionsController {
  constructor(private readonly connectionsService: EInvoiceConnectionsService) {}

  @RequirePermissions("integrations.view")
  @Get(":provider")
  getStatus(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("provider", new ParseEnumPipe(EInvoiceProviderType)) provider: EInvoiceProviderType,
  ) {
    return this.connectionsService.getStatus(tenant.id, provider);
  }

  @RequirePermissions("integrations.manage")
  @Post(":provider/connect")
  connect(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("provider", new ParseEnumPipe(EInvoiceProviderType)) provider: EInvoiceProviderType,
    @CurrentUser() user: PublicUser,
    @Body() dto: ConnectEInvoiceDto,
  ) {
    return this.connectionsService.connect(tenant.id, provider, user.id, dto);
  }

  @RequirePermissions("integrations.manage")
  @Post(":provider/disconnect")
  disconnect(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("provider", new ParseEnumPipe(EInvoiceProviderType)) provider: EInvoiceProviderType,
    @CurrentUser() user: PublicUser,
  ) {
    return this.connectionsService.disconnect(tenant.id, provider, user.id);
  }
}
