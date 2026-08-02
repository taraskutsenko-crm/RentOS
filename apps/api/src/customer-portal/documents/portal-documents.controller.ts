import { Controller, Get, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";

import { Public } from "../../auth/decorators/public.decorator";
import { CurrentCustomer } from "../auth/decorators/current-customer.decorator";
import { CustomerAuthGuard } from "../auth/guards/customer-auth.guard";
import type { PublicCustomer } from "../common/public-customer.mapper";
import { QueryPortalDocumentsDto } from "../dto/query-portal-documents.dto";
import { PortalDocumentsService } from "./portal-documents.service";

@Public()
@UseGuards(CustomerAuthGuard)
@Controller("portal/documents")
export class PortalDocumentsController {
  constructor(private readonly portalDocumentsService: PortalDocumentsService) {}

  @Get()
  findMany(@CurrentCustomer() customer: PublicCustomer, @Query() query: QueryPortalDocumentsDto) {
    return this.portalDocumentsService.findMany(customer.tenantId, customer.id, query);
  }

  @Get(":id")
  findOne(@CurrentCustomer() customer: PublicCustomer, @Param("id") id: string) {
    return this.portalDocumentsService.findOne(customer.tenantId, customer.id, id);
  }

  @Get(":id/preview")
  preview(@CurrentCustomer() customer: PublicCustomer, @Param("id") id: string) {
    return this.portalDocumentsService.preview(customer.tenantId, customer.id, id);
  }

  @Get(":id/pdf")
  async getPdf(
    @CurrentCustomer() customer: PublicCustomer,
    @Param("id") id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, file } = await this.portalDocumentsService.getPdf(
      customer.tenantId,
      customer.id,
      id,
    );
    res.set(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(file.originalFileName)}"`,
    );
    res.type("application/pdf").send(buffer);
  }

  @Get(":id/signature-requests")
  listSignatureRequests(@CurrentCustomer() customer: PublicCustomer, @Param("id") id: string) {
    return this.portalDocumentsService.listSignatureRequests(customer.tenantId, customer.id, id);
  }

  @Post(":id/signature-requests/:requestId/sign")
  sign(
    @CurrentCustomer() customer: PublicCustomer,
    @Param("id") id: string,
    @Param("requestId") requestId: string,
  ) {
    return this.portalDocumentsService.sign(customer.tenantId, customer.id, id, requestId);
  }
}
