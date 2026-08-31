import { Controller, Get, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";

import { Public } from "../../auth/decorators/public.decorator";
import { CompanyLogoService } from "../../company-branding/company-logo.service";
import { CurrentCustomer } from "../auth/decorators/current-customer.decorator";
import { CustomerAuthGuard } from "../auth/guards/customer-auth.guard";
import type { PublicCustomer } from "../common/public-customer.mapper";

/**
 * Havelio Company Branding (docs/PRODUCT_BIBLE.md) — lets a logged-in
 * portal customer see the tenant's own company logo, scoped entirely by
 * their own session's `tenantId` (never a client-supplied tenant/logo
 * id), so tenant isolation holds the same way every other portal endpoint
 * already enforces it.
 */
@Public()
@UseGuards(CustomerAuthGuard)
@Controller("portal/branding")
export class PortalBrandingController {
  constructor(private readonly companyLogoService: CompanyLogoService) {}

  @Get("logo/file")
  async getLogoFile(
    @CurrentCustomer() customer: PublicCustomer,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mimeType } = await this.companyLogoService.readFile(customer.tenantId);
    res.type(mimeType).send(buffer);
  }
}
