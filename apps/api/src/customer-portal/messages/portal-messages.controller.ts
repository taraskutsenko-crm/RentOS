import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";

import { Public } from "../../auth/decorators/public.decorator";
import { CurrentCustomer } from "../auth/decorators/current-customer.decorator";
import { CustomerAuthGuard } from "../auth/guards/customer-auth.guard";
import type { PublicCustomer } from "../common/public-customer.mapper";
import { SendPortalMessageDto } from "../dto/send-portal-message.dto";
import { PortalMessagesService } from "./portal-messages.service";

@Public()
@UseGuards(CustomerAuthGuard)
@Controller("portal/messages")
export class PortalMessagesController {
  constructor(private readonly messagesService: PortalMessagesService) {}

  @Get()
  findMany(@CurrentCustomer() customer: PublicCustomer, @Query("rentalId") rentalId?: string) {
    return this.messagesService.findMany(customer.tenantId, customer.id, rentalId);
  }

  @Post()
  send(@CurrentCustomer() customer: PublicCustomer, @Body() dto: SendPortalMessageDto) {
    return this.messagesService.sendAsCustomer(customer.tenantId, customer.id, dto);
  }
}
