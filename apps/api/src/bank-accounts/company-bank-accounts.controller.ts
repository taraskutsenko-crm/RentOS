import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
import { CompanyBankAccountsService } from "./company-bank-accounts.service";
import { CreateCompanyBankAccountDto } from "./dto/create-company-bank-account.dto";
import { UpdateCompanyBankAccountDto } from "./dto/update-company-bank-account.dto";

@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/bank-accounts")
export class CompanyBankAccountsController {
  constructor(private readonly bankAccountsService: CompanyBankAccountsService) {}

  @RequirePermissions("bankAccounts.view")
  @Get()
  findMany(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Query("includeInactive") includeInactive?: string,
  ) {
    return this.bankAccountsService.findMany(tenant.id, includeInactive === "true");
  }

  @RequirePermissions("bankAccounts.view")
  @Get(":id")
  findOne(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.bankAccountsService.findOne(tenant.id, id);
  }

  @RequirePermissions("bankAccounts.manage")
  @Post()
  create(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Body() dto: CreateCompanyBankAccountDto,
  ) {
    return this.bankAccountsService.create(tenant.id, user.id, dto);
  }

  @RequirePermissions("bankAccounts.manage")
  @Patch(":id")
  update(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: PublicUser,
    @Body() dto: UpdateCompanyBankAccountDto,
  ) {
    return this.bankAccountsService.update(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("bankAccounts.manage")
  @Delete(":id")
  deactivate(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: PublicUser,
  ) {
    return this.bankAccountsService.deactivate(tenant.id, id, user.id);
  }
}
