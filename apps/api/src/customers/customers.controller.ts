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
import { TenantGuard } from "../tenants/tenant.guard";
import type { PublicUser } from "../users/user.mapper";
import { CustomersService } from "./customers.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { QueryCustomersDto } from "./dto/query-customers.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";

@UseGuards(TenantGuard)
@Controller("tenants/:tenantId/customers")
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customersService.create(tenant.id, user.id, dto);
  }

  @Get()
  findMany(@CurrentTenant() { tenant }: CurrentTenantContext, @Query() query: QueryCustomersDto) {
    return this.customersService.findMany(tenant.id, query);
  }

  @Get(":id")
  findOne(@CurrentTenant() { tenant }: CurrentTenantContext, @Param("id") id: string) {
    return this.customersService.findOne(tenant.id, id);
  }

  @Get(":id/timeline")
  timeline(@CurrentTenant() { tenant }: CurrentTenantContext, @Param("id") id: string) {
    return this.customersService.timeline(tenant.id, id);
  }

  @Get(":id/summary")
  summary(@CurrentTenant() { tenant }: CurrentTenantContext, @Param("id") id: string) {
    return this.customersService.summary(tenant.id, id);
  }

  @Patch(":id")
  update(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(tenant.id, id, user.id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
  ) {
    return this.customersService.remove(tenant.id, id, user.id);
  }
}
