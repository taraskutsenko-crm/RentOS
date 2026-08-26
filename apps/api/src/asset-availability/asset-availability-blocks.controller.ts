import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";

import {
  CurrentTenant,
  type CurrentTenantContext,
} from "../auth/decorators/current-tenant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PermissionsGuard } from "../permissions/permissions.guard";
import { RequirePermissions } from "../permissions/require-permissions.decorator";
import { TenantGuard } from "../tenants/tenant.guard";
import type { PublicUser } from "../users/user.mapper";
import { AssetAvailabilityBlocksService } from "./asset-availability-blocks.service";
import { CancelAvailabilityBlockDto } from "./dto/cancel-availability-block.dto";
import { CreateAvailabilityBlockDto } from "./dto/create-availability-block.dto";

@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/assets/:assetId/availability-blocks")
export class AssetAvailabilityBlocksController {
  constructor(private readonly blocksService: AssetAvailabilityBlocksService) {}

  @RequirePermissions("assets.read")
  @Get()
  findForAsset(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("assetId") assetId: string,
  ) {
    return this.blocksService.findForAsset(tenant.id, assetId);
  }

  @RequirePermissions("assets.manage_availability")
  @Post()
  create(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("assetId") assetId: string,
    @Body() dto: CreateAvailabilityBlockDto,
  ) {
    return this.blocksService.create(tenant.id, assetId, user.id, dto);
  }

  @RequirePermissions("assets.manage_availability")
  @Post(":blockId/cancel")
  cancel(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("assetId") assetId: string,
    @Param("blockId") blockId: string,
    @Body() dto: CancelAvailabilityBlockDto,
  ) {
    return this.blocksService.cancel(tenant.id, assetId, blockId, user.id, dto);
  }
}
