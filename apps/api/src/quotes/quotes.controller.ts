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
import { AcceptQuoteDto } from "./dto/accept-quote.dto";
import { CreateQuoteDto } from "./dto/create-quote.dto";
import { QueryQuotesDto } from "./dto/query-quotes.dto";
import { SendQuoteDto } from "./dto/send-quote.dto";
import { StatusActionDto } from "./dto/status-action.dto";
import { UpdateQuoteDto } from "./dto/update-quote.dto";
import { QuotesService } from "./quotes.service";

/**
 * Tenant-namespaced under /tenants/:tenantId/quotes, consistent with every
 * other business module (see ADR 0001 and docs/adr/0006's route-namespace
 * rationale, which applies identically here). Public, token-authenticated
 * access lives in PublicQuotesController under a separate /public/quotes
 * namespace instead.
 */
@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/quotes")
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @RequirePermissions("quotes.create")
  @Post()
  create(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Body() dto: CreateQuoteDto,
  ) {
    return this.quotesService.create(tenant.id, user.id, dto);
  }

  @RequirePermissions("quotes.view")
  @Get()
  findMany(@CurrentTenant() { tenant }: CurrentTenantContext, @Query() query: QueryQuotesDto) {
    return this.quotesService.findMany(tenant.id, query);
  }

  @RequirePermissions("quotes.view")
  @Get(":id")
  findOne(@CurrentTenant() { tenant }: CurrentTenantContext, @Param("id") id: string) {
    return this.quotesService.findOne(tenant.id, id);
  }

  @RequirePermissions("quotes.update")
  @Patch(":id")
  update(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: UpdateQuoteDto,
  ) {
    return this.quotesService.update(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("quotes.delete")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
  ) {
    return this.quotesService.remove(tenant.id, id, user.id);
  }

  @RequirePermissions("quotes.send")
  @Post(":id/send")
  send(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: SendQuoteDto,
  ) {
    return this.quotesService.send(tenant.id, id, user.id, dto);
  }

  /** Staff-recorded acceptance (e.g. the customer approved verbally or by email). */
  @RequirePermissions("quotes.accept")
  @Post(":id/accept")
  accept(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: AcceptQuoteDto,
  ) {
    return this.quotesService.accept(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("quotes.reject")
  @Post(":id/reject")
  reject(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: StatusActionDto,
  ) {
    return this.quotesService.reject(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("quotes.update")
  @Post(":id/cancel")
  cancel(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: StatusActionDto,
  ) {
    return this.quotesService.cancel(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("quotes.duplicate")
  @Post(":id/duplicate")
  duplicate(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
  ) {
    return this.quotesService.duplicate(tenant.id, id, user.id);
  }

  @RequirePermissions("quotes.convert")
  @Post(":id/convert-to-rental")
  convertToRental(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
  ) {
    return this.quotesService.convertToRental(tenant.id, id, user.id);
  }

  @RequirePermissions("quotes.download")
  @Get(":id/pdf")
  async getPdf(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("id") id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, fileName } = await this.quotesService.getPdf(tenant.id, id);
    res.set("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
    res.type("application/pdf").send(buffer);
  }

  @RequirePermissions("quotes.download")
  @Post(":id/pdf")
  async regeneratePdf(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, fileName } = await this.quotesService.regeneratePdf(tenant.id, id, user.id);
    res.set("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
    res.type("application/pdf").send(buffer);
  }

  @RequirePermissions("quotes.view")
  @Get(":id/history")
  history(@CurrentTenant() { tenant }: CurrentTenantContext, @Param("id") id: string) {
    return this.quotesService.history(tenant.id, id);
  }
}
