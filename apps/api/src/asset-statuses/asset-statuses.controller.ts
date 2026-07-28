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
import { AssetStatusesService } from "./asset-statuses.service";
import { CreateAssetStatusDto } from "./dto/create-asset-status.dto";
import { UpdateAssetStatusDto } from "./dto/update-asset-status.dto";

@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/asset-statuses")
export class AssetStatusesController {
  constructor(private readonly assetStatusesService: AssetStatusesService) {}

  @RequirePermissions("asset_statuses.read")
  @Get()
  findMany(@CurrentTenant() { tenant }: CurrentTenantContext) {
    return this.assetStatusesService.findMany(tenant.id);
  }

  @RequirePermissions("asset_statuses.manage")
  @Post()
  create(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Body() dto: CreateAssetStatusDto,
  ) {
    return this.assetStatusesService.create(tenant.id, user.id, dto);
  }

  @RequirePermissions("asset_statuses.manage")
  @Patch(":statusId")
  update(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("statusId") statusId: string,
    @Body() dto: UpdateAssetStatusDto,
  ) {
    return this.assetStatusesService.update(tenant.id, statusId, user.id, dto);
  }

  @RequirePermissions("asset_statuses.manage")
  @Delete(":statusId")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("statusId") statusId: string,
  ) {
    return this.assetStatusesService.remove(tenant.id, statusId, user.id);
  }
}
