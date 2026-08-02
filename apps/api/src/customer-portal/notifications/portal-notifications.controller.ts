import { Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";

import { Public } from "../../auth/decorators/public.decorator";
import { CurrentCustomer } from "../auth/decorators/current-customer.decorator";
import { CustomerAuthGuard } from "../auth/guards/customer-auth.guard";
import type { PublicCustomer } from "../common/public-customer.mapper";
import { PortalNotificationsService } from "./portal-notifications.service";

@Public()
@UseGuards(CustomerAuthGuard)
@Controller("portal/notifications")
export class PortalNotificationsController {
  constructor(private readonly notificationsService: PortalNotificationsService) {}

  @Get()
  findMany(@CurrentCustomer() customer: PublicCustomer, @Query("unreadOnly") unreadOnly?: string) {
    return this.notificationsService.findMany(
      customer.tenantId,
      customer.id,
      unreadOnly === "true",
    );
  }

  @Get("unread-count")
  unreadCount(@CurrentCustomer() customer: PublicCustomer) {
    return this.notificationsService
      .unreadCount(customer.tenantId, customer.id)
      .then((count) => ({ count }));
  }

  @Post(":id/read")
  markRead(@CurrentCustomer() customer: PublicCustomer, @Param("id") id: string) {
    return this.notificationsService.markRead(customer.tenantId, customer.id, id);
  }

  @Post("read-all")
  markAllRead(@CurrentCustomer() customer: PublicCustomer) {
    return this.notificationsService.markAllRead(customer.tenantId, customer.id);
  }
}
