import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";

import {
  CurrentTenant,
  type CurrentTenantContext,
} from "../auth/decorators/current-tenant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PermissionsGuard } from "../permissions/permissions.guard";
import { RequirePermissions } from "../permissions/require-permissions.decorator";
import { TenantGuard } from "../tenants/tenant.guard";
import type { PublicUser } from "../users/user.mapper";
import { RecordPaymentDto } from "./dto/record-payment.dto";
import { PaymentsService } from "./payments.service";

@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/invoices/:invoiceId/payments")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @RequirePermissions("payments.view")
  @Get()
  findMany(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
  ) {
    return this.paymentsService.findMany(tenant.id, invoiceId);
  }

  @RequirePermissions("payments.record")
  @Post()
  record(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
    @CurrentUser() user: PublicUser,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.paymentsService.record(tenant.id, invoiceId, user.id, dto);
  }
}
