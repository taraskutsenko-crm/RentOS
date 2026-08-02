import { Controller, Get, UseGuards } from "@nestjs/common";

import { Public } from "../../auth/decorators/public.decorator";
import { CurrentCustomer } from "../auth/decorators/current-customer.decorator";
import { CustomerAuthGuard } from "../auth/guards/customer-auth.guard";
import type { PublicCustomer } from "../common/public-customer.mapper";
import { PortalDashboardService } from "./portal-dashboard.service";

@Public()
@UseGuards(CustomerAuthGuard)
@Controller("portal/dashboard")
export class PortalDashboardController {
  constructor(private readonly dashboardService: PortalDashboardService) {}

  @Get()
  summary(@CurrentCustomer() customer: PublicCustomer) {
    return this.dashboardService.summary(customer.tenantId, customer.id);
  }
}
