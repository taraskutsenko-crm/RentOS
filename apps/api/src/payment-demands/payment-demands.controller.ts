import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";

import {
  CurrentTenant,
  type CurrentTenantContext,
} from "../auth/decorators/current-tenant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PermissionsGuard } from "../permissions/permissions.guard";
import { RequirePermissions } from "../permissions/require-permissions.decorator";
import { TenantGuard } from "../tenants/tenant.guard";
import type { PublicUser } from "../users/user.mapper";
import { CreatePaymentDemandDto } from "./dto/create-payment-demand.dto";
import { SendPaymentDemandEmailDto } from "./dto/send-payment-demand-email.dto";
import { PaymentDemandEmailService } from "./payment-demand-email.service";
import { PaymentDemandsService } from "./payment-demands.service";
import { PaymentDemandPdfService } from "./rendering/payment-demand-pdf.service";
import { PaymentDemandRendererService } from "./rendering/payment-demand-renderer.service";

@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/invoices/:invoiceId/payment-demands")
export class PaymentDemandsController {
  constructor(
    private readonly paymentDemandsService: PaymentDemandsService,
    private readonly renderer: PaymentDemandRendererService,
    private readonly pdfService: PaymentDemandPdfService,
    private readonly emailService: PaymentDemandEmailService,
  ) {}

  @RequirePermissions("payment_demands.view")
  @Get()
  findMany(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
  ) {
    return this.paymentDemandsService.findMany(tenant.id, invoiceId);
  }

  @RequirePermissions("payment_demands.create")
  @Post()
  create(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
    @CurrentUser() user: PublicUser,
    @Body() dto: CreatePaymentDemandDto,
  ) {
    return this.paymentDemandsService.create(tenant.id, invoiceId, user.id, dto);
  }

  @RequirePermissions("payment_demands.view")
  @Get(":id/preview")
  async getPreview(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const demand = await this.paymentDemandsService.findOne(tenant.id, id);
    return this.renderer.render(demand);
  }

  @RequirePermissions("payment_demands.view")
  @Get(":id/pdf")
  async getPdf(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const demand = await this.paymentDemandsService.findOne(tenant.id, id);
    const buffer = await this.pdfService.render(demand);
    res.set(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(demand.demandNumber)}.pdf"`,
    );
    res.type("application/pdf").send(buffer);
  }

  @RequirePermissions("payment_demands.send")
  @Post(":id/email")
  sendEmail(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: PublicUser,
    @Body() dto: SendPaymentDemandEmailDto,
  ) {
    return this.emailService.send(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("payment_demands.view")
  @Get(":id/email-deliveries")
  findEmailDeliveries(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.emailService.findDeliveries(tenant.id, id);
  }
}
