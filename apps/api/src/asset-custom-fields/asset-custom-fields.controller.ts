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
import { AssetCustomFieldsService } from "./asset-custom-fields.service";
import { CreateAssetCustomFieldDto } from "./dto/create-asset-custom-field.dto";
import { QueryAssetCustomFieldsDto } from "./dto/query-asset-custom-fields.dto";
import { UpdateAssetCustomFieldDto } from "./dto/update-asset-custom-field.dto";

@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/asset-custom-fields")
export class AssetCustomFieldsController {
  constructor(private readonly assetCustomFieldsService: AssetCustomFieldsService) {}

  @RequirePermissions("asset_fields.manage")
  @Post()
  create(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Body() dto: CreateAssetCustomFieldDto,
  ) {
    return this.assetCustomFieldsService.create(tenant.id, user.id, dto);
  }

  @RequirePermissions("asset_fields.read")
  @Get()
  findMany(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Query() query: QueryAssetCustomFieldsDto,
  ) {
    return this.assetCustomFieldsService.findMany(tenant.id, query);
  }

  @RequirePermissions("asset_fields.read")
  @Get("for-category/:categoryId")
  forCategory(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("categoryId") categoryId: string,
  ) {
    return this.assetCustomFieldsService.forCategory(tenant.id, categoryId);
  }

  @RequirePermissions("asset_fields.manage")
  @Patch(":fieldId")
  update(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("fieldId") fieldId: string,
    @Body() dto: UpdateAssetCustomFieldDto,
  ) {
    return this.assetCustomFieldsService.update(tenant.id, fieldId, user.id, dto);
  }

  @RequirePermissions("asset_fields.manage")
  @Delete(":fieldId")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("fieldId") fieldId: string,
  ) {
    return this.assetCustomFieldsService.remove(tenant.id, fieldId, user.id);
  }
}
