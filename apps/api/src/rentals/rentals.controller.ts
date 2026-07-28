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
import { AvailabilityService } from "./availability.service";
import { CreateRentalDto } from "./dto/create-rental.dto";
import { QueryAvailabilityDto } from "./dto/query-availability.dto";
import { QueryRentalsDto } from "./dto/query-rentals.dto";
import { ReturnRentalDto } from "./dto/return-rental.dto";
import { StatusActionDto } from "./dto/status-action.dto";
import { UpdateRentalDto } from "./dto/update-rental.dto";
import { RentalsService } from "./rentals.service";

/**
 * Tenant-namespaced under /tenants/:tenantId/rentals, consistent with every
 * other business module and TenantGuard's design (see ADR 0001 and
 * docs/adr/0006-rental-lifecycle-and-availability.md) — the master spec's
 * flat `/rentals` listing is treated as shorthand, not a request to bypass
 * the platform's tenant-isolation mechanism.
 */
@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/rentals")
export class RentalsController {
  constructor(
    private readonly rentalsService: RentalsService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  @RequirePermissions("rentals.create")
  @Post()
  create(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Body() dto: CreateRentalDto,
  ) {
    return this.rentalsService.create(tenant.id, user.id, dto);
  }

  @RequirePermissions("rentals.view")
  @Get()
  findMany(@CurrentTenant() { tenant }: CurrentTenantContext, @Query() query: QueryRentalsDto) {
    return this.rentalsService.findMany(tenant.id, query);
  }

  @RequirePermissions("rentals.view")
  @Get("availability")
  async availability(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Query() query: QueryAvailabilityDto,
  ) {
    const results = await this.availabilityService.checkAvailability(
      tenant.id,
      query.assetIds,
      new Date(query.plannedStart),
      new Date(query.plannedEnd),
      query.excludeRentalId,
    );
    return { results };
  }

  @RequirePermissions("rentals.view")
  @Get(":id")
  findOne(@CurrentTenant() { tenant }: CurrentTenantContext, @Param("id") id: string) {
    return this.rentalsService.findOne(tenant.id, id);
  }

  @RequirePermissions("rentals.update")
  @Patch(":id")
  update(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: UpdateRentalDto,
  ) {
    return this.rentalsService.update(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("rentals.delete")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
  ) {
    return this.rentalsService.remove(tenant.id, id, user.id);
  }

  @RequirePermissions("rentals.reserve")
  @Post(":id/reserve")
  reserve(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: StatusActionDto,
  ) {
    return this.rentalsService.reserve(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("rentals.start")
  @Post(":id/start")
  start(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: StatusActionDto,
  ) {
    return this.rentalsService.start(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("rentals.return")
  @Post(":id/return")
  returnRental(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: ReturnRentalDto,
  ) {
    return this.rentalsService.returnRental(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("rentals.cancel")
  @Post(":id/cancel")
  cancel(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: StatusActionDto,
  ) {
    return this.rentalsService.cancel(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("rentals.view")
  @Get(":id/timeline")
  timeline(@CurrentTenant() { tenant }: CurrentTenantContext, @Param("id") id: string) {
    return this.rentalsService.timeline(tenant.id, id);
  }
}
