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
import { AssetCategoriesService } from "./asset-categories.service";
import { CreateAssetCategoryDto } from "./dto/create-asset-category.dto";
import { QueryAssetCategoriesDto } from "./dto/query-asset-categories.dto";
import { UpdateAssetCategoryDto } from "./dto/update-asset-category.dto";

@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/asset-categories")
export class AssetCategoriesController {
  constructor(private readonly assetCategoriesService: AssetCategoriesService) {}

  @RequirePermissions("asset_categories.manage")
  @Post()
  create(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Body() dto: CreateAssetCategoryDto,
  ) {
    return this.assetCategoriesService.create(tenant.id, user.id, dto);
  }

  @RequirePermissions("asset_categories.read")
  @Get()
  findMany(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Query() query: QueryAssetCategoriesDto,
  ) {
    return this.assetCategoriesService.findMany(tenant.id, query);
  }

  @RequirePermissions("asset_categories.read")
  @Get("tree")
  tree(@CurrentTenant() { tenant }: CurrentTenantContext) {
    return this.assetCategoriesService.tree(tenant.id);
  }

  @RequirePermissions("asset_categories.manage")
  @Patch(":categoryId")
  update(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("categoryId") categoryId: string,
    @Body() dto: UpdateAssetCategoryDto,
  ) {
    return this.assetCategoriesService.update(tenant.id, categoryId, user.id, dto);
  }

  @RequirePermissions("asset_categories.manage")
  @Delete(":categoryId")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("categoryId") categoryId: string,
  ) {
    return this.assetCategoriesService.remove(tenant.id, categoryId, user.id);
  }
}
