import { Controller, Get, Param, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";

import { Public } from "../../auth/decorators/public.decorator";
import { CurrentCustomer } from "../auth/decorators/current-customer.decorator";
import { CustomerAuthGuard } from "../auth/guards/customer-auth.guard";
import type { PublicCustomer } from "../common/public-customer.mapper";
import { PortalAssetsService } from "./portal-assets.service";

@Public()
@UseGuards(CustomerAuthGuard)
@Controller("portal/assets")
export class PortalAssetsController {
  constructor(private readonly portalAssetsService: PortalAssetsService) {}

  @Get(":id")
  findOne(@CurrentCustomer() customer: PublicCustomer, @Param("id") id: string) {
    return this.portalAssetsService.findOne(customer.tenantId, customer.id, id);
  }

  @Get(":id/images/:imageId")
  async getImage(
    @CurrentCustomer() customer: PublicCustomer,
    @Param("id") id: string,
    @Param("imageId") imageId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mimeType } = await this.portalAssetsService.readImage(
      customer.tenantId,
      customer.id,
      id,
      imageId,
    );
    res.type(mimeType).send(buffer);
  }
}
