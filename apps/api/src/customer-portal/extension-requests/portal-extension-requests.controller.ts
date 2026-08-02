import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";

import { Public } from "../../auth/decorators/public.decorator";
import { CurrentCustomer } from "../auth/decorators/current-customer.decorator";
import { CustomerAuthGuard } from "../auth/guards/customer-auth.guard";
import type { PublicCustomer } from "../common/public-customer.mapper";
import { CreateExtensionRequestDto } from "../dto/create-extension-request.dto";
import { PortalExtensionRequestsService } from "./portal-extension-requests.service";

@Public()
@UseGuards(CustomerAuthGuard)
@Controller("portal/extension-requests")
export class PortalExtensionRequestsController {
  constructor(private readonly extensionRequestsService: PortalExtensionRequestsService) {}

  @Get()
  findMany(@CurrentCustomer() customer: PublicCustomer, @Query("rentalId") rentalId?: string) {
    return this.extensionRequestsService.findMany(customer.tenantId, customer.id, rentalId);
  }

  @Post("rentals/:rentalId")
  create(
    @CurrentCustomer() customer: PublicCustomer,
    @Param("rentalId") rentalId: string,
    @Body() dto: CreateExtensionRequestDto,
  ) {
    return this.extensionRequestsService.create(customer.tenantId, customer.id, rentalId, dto);
  }
}
