import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import {
  CurrentTenant,
  type CurrentTenantContext,
} from "../auth/decorators/current-tenant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PermissionsGuard } from "../permissions/permissions.guard";
import { RequirePermissions } from "../permissions/require-permissions.decorator";
import { TenantGuard } from "../tenants/tenant.guard";
import type { PublicUser } from "../users/user.mapper";
import { AssetsService } from "./assets.service";
import { ChangeAssetLocationDto } from "./dto/change-asset-location.dto";
import { ChangeAssetStatusDto } from "./dto/change-asset-status.dto";
import { CreateAssetDto } from "./dto/create-asset.dto";
import { QueryAssetsDto } from "./dto/query-assets.dto";
import { UpdateAssetDto } from "./dto/update-asset.dto";

@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/assets")
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @RequirePermissions("assets.create")
  @Post()
  create(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Body() dto: CreateAssetDto,
  ) {
    return this.assetsService.create(tenant.id, user.id, dto);
  }

  @RequirePermissions("assets.read")
  @Get()
  findMany(@CurrentTenant() { tenant }: CurrentTenantContext, @Query() query: QueryAssetsDto) {
    return this.assetsService.findMany(tenant.id, query);
  }

  // Dashboard "Available assets" KPI (must be declared before the
  // parameterized :assetId route below, per this controller's existing
  // route-ordering convention). Returns the canonical count — see
  // AssetsService.countAvailableNow's doc comment for why this can never be
  // a catalog isRentable/currentStatusId filter.
  @RequirePermissions("assets.read")
  @Get("available-count")
  async availableCount(@CurrentTenant() { tenant }: CurrentTenantContext) {
    return { count: await this.assetsService.countAvailableNow(tenant.id) };
  }

  @RequirePermissions("assets.read")
  @Get(":assetId")
  findOne(@CurrentTenant() { tenant }: CurrentTenantContext, @Param("assetId") assetId: string) {
    return this.assetsService.findOne(tenant.id, assetId);
  }

  @RequirePermissions("assets.update")
  @Patch(":assetId")
  update(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("assetId") assetId: string,
    @Body() dto: UpdateAssetDto,
  ) {
    return this.assetsService.update(tenant.id, assetId, user.id, dto);
  }

  @RequirePermissions("assets.delete")
  @Delete(":assetId")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("assetId") assetId: string,
  ) {
    return this.assetsService.remove(tenant.id, assetId, user.id);
  }

  @RequirePermissions("assets.change_status")
  @Post(":assetId/status")
  changeStatus(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("assetId") assetId: string,
    @Body() dto: ChangeAssetStatusDto,
  ) {
    return this.assetsService.changeStatus(tenant.id, assetId, user.id, dto);
  }

  @RequirePermissions("assets.update")
  @Post(":assetId/location")
  changeLocation(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("assetId") assetId: string,
    @Body() dto: ChangeAssetLocationDto,
  ) {
    return this.assetsService.changeLocation(tenant.id, assetId, user.id, dto);
  }

  @RequirePermissions("assets.read")
  @Get(":assetId/timeline")
  timeline(@CurrentTenant() { tenant }: CurrentTenantContext, @Param("assetId") assetId: string) {
    return this.assetsService.timeline(tenant.id, assetId);
  }

  @RequirePermissions("assets.read")
  @Get(":assetId/summary")
  summary(@CurrentTenant() { tenant }: CurrentTenantContext, @Param("assetId") assetId: string) {
    return this.assetsService.summary(tenant.id, assetId);
  }
}
