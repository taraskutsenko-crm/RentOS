import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { CancelInvoiceDto } from "./dto/cancel-invoice.dto";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { QueryInvoicesDto } from "./dto/query-invoices.dto";
import { UpdateInvoiceDto } from "./dto/update-invoice.dto";
import { InvoicesService } from "./invoices.service";
import { InvoicePdfService } from "./rendering/invoice-pdf.service";
import { InvoiceRendererService } from "./rendering/invoice-renderer.service";

@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/invoices")
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly invoicePdfService: InvoicePdfService,
    private readonly invoiceRenderer: InvoiceRendererService,
  ) {}

  @RequirePermissions("invoices.view")
  @Get()
  findMany(@CurrentTenant() { tenant }: CurrentTenantContext, @Query() query: QueryInvoicesDto) {
    return this.invoicesService.findMany(tenant.id, query);
  }

  @RequirePermissions("invoices.view")
  @Get(":id")
  findOne(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.invoicesService.findOne(tenant.id, id);
  }

  @RequirePermissions("invoices.create")
  @Post()
  create(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.invoicesService.create(tenant.id, user.id, dto);
  }

  @RequirePermissions("invoices.update")
  @Patch(":id")
  update(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: PublicUser,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("invoices.issue")
  @Post(":id/issue")
  issue(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: PublicUser,
  ) {
    return this.invoicesService.issue(tenant.id, id, user.id);
  }

  @RequirePermissions("invoices.send")
  @Post(":id/send")
  markSent(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: PublicUser,
  ) {
    return this.invoicesService.markSent(tenant.id, id, user.id);
  }

  @RequirePermissions("invoices.cancel")
  @Post(":id/cancel")
  cancel(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: PublicUser,
    @Body() dto: CancelInvoiceDto,
  ) {
    return this.invoicesService.cancel(tenant.id, id, user.id, dto.reason ?? null);
  }

  /**
   * The same HTML `InvoicePdfService`/Puppeteer renders to PDF, returned
   * directly for an in-page iframe preview + native browser print — the
   * exact same "print the iframe's own content window" pattern the generic
   * Document detail page already uses (see DECISIONS.md D-107), so Invoice
   * gets a direct-print action without a manual PDF download/open round
   * trip. Gated by `invoices.view`, same as opening the invoice at all —
   * viewing a rendering of data you can already see is not a stronger
   * permission than viewing the data itself.
   */
  @RequirePermissions("invoices.view")
  @Get(":id/preview")
  async getPreview(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const invoice = await this.invoicesService.findOne(tenant.id, id);
    return this.invoiceRenderer.render(invoice);
  }

  @RequirePermissions("invoices.download")
  @Get(":id/pdf")
  async getPdf(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const invoice = await this.invoicesService.findOne(tenant.id, id);
    const buffer = await this.invoicePdfService.render(invoice);
    res.set(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(invoice.invoiceNumber)}.pdf"`,
    );
    res.type("application/pdf").send(buffer);
  }
}
