import { Controller, Get, Param, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";

import { Public } from "../../auth/decorators/public.decorator";
import { PortalAssetsService } from "../assets/portal-assets.service";
import { CurrentCustomer } from "../auth/decorators/current-customer.decorator";
import { CustomerAuthGuard } from "../auth/guards/customer-auth.guard";
import type { PublicCustomer } from "../common/public-customer.mapper";
import { PortalDocumentsService } from "../documents/portal-documents.service";
import { QueryPortalRentalsDto } from "../dto/query-portal-rentals.dto";
import { PortalRentalsService } from "./portal-rentals.service";

@Public()
@UseGuards(CustomerAuthGuard)
@Controller("portal/rentals")
export class PortalRentalsController {
  constructor(
    private readonly portalRentalsService: PortalRentalsService,
    private readonly portalDocumentsService: PortalDocumentsService,
    private readonly portalAssetsService: PortalAssetsService,
  ) {}

  @Get()
  findMany(@CurrentCustomer() customer: PublicCustomer, @Query() query: QueryPortalRentalsDto) {
    return this.portalRentalsService.findMany(customer.tenantId, customer.id, query);
  }

  @Get(":id")
  findOne(@CurrentCustomer() customer: PublicCustomer, @Param("id") id: string) {
    return this.portalRentalsService.findOne(customer.tenantId, customer.id, id);
  }

  @Get(":id/timeline")
  timeline(@CurrentCustomer() customer: PublicCustomer, @Param("id") id: string) {
    return this.portalRentalsService.timeline(customer.tenantId, customer.id, id);
  }

  @Get(":id/documents/zip")
  async downloadDocumentsZip(
    @CurrentCustomer() customer: PublicCustomer,
    @Param("id") id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.portalRentalsService.findOne(customer.tenantId, customer.id, id);
    const { buffer, fileName } = await this.portalDocumentsService.zipRentalDocuments(
      customer.tenantId,
      customer.id,
      id,
    );
    res.set("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.type("application/zip").send(buffer);
  }

  @Get(":id/qr-code")
  async qrCode(
    @CurrentCustomer() customer: PublicCustomer,
    @Param("id") id: string,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.portalAssetsService.rentalQrCode(customer.tenantId, customer.id, id);
    res.type("image/png").send(buffer);
  }
}
