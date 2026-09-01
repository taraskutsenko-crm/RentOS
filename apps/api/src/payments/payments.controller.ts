import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { ApplyDepositDto } from "./dto/apply-deposit.dto";
import { MarkFullyPaidDto } from "./dto/mark-fully-paid.dto";
import { RecordPaymentDto } from "./dto/record-payment.dto";
import { VoidPaymentDto } from "./dto/void-payment.dto";
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

  /** "Mark as paid" — the one-click full-payment action (see PaymentsService.markFullyPaid). */
  @RequirePermissions("payments.record")
  @Post("mark-fully-paid")
  markFullyPaid(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
    @CurrentUser() user: PublicUser,
    @Body() dto: MarkFullyPaidDto,
  ) {
    return this.paymentsService.markFullyPaid(tenant.id, invoiceId, user.id, dto);
  }

  /** "Apply deposit to balance" (Phase 10) — see PaymentsService.applyDeposit. */
  @RequirePermissions("payments.record")
  @Post("apply-deposit")
  applyDeposit(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
    @CurrentUser() user: PublicUser,
    @Body() dto: ApplyDepositDto,
  ) {
    return this.paymentsService.applyDeposit(tenant.id, invoiceId, user.id, dto);
  }

  @RequirePermissions("payments.void")
  @Post(":paymentId/void")
  void(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
    @Param("paymentId", ParseUUIDPipe) paymentId: string,
    @CurrentUser() user: PublicUser,
    @Body() dto: VoidPaymentDto,
  ) {
    return this.paymentsService.void(tenant.id, invoiceId, paymentId, user.id, dto);
  }
}
