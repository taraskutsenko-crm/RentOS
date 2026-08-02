import { BadRequestException, Injectable } from "@nestjs/common";
import type { CustomerPortalMessage } from "@prisma/client";

import { AuditService } from "../../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import type { SendPortalMessageDto } from "../dto/send-portal-message.dto";
import { PortalNotificationsService } from "../notifications/portal-notifications.service";
import { PortalRentalsService } from "../rentals/portal-rentals.service";

/**
 * A single threaded conversation per (tenant, customer), optionally scoped
 * to a rental — one table serves both the customer-sent and staff-sent
 * direction (see CustomerPortalMessage's schema doc comment). There is no
 * staff-facing notification/badge for a new customer message today (only
 * CustomerNotification exists, customer-scoped by design) — staff check
 * the message panel on the customer's detail page directly; see
 * docs/adr/0012-customer-portal.md for this documented limitation.
 */
@Injectable()
export class PortalMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly portalRentalsService: PortalRentalsService,
    private readonly notificationsService: PortalNotificationsService,
  ) {}

  async sendAsCustomer(
    tenantId: string,
    customerId: string,
    dto: SendPortalMessageDto,
  ): Promise<CustomerPortalMessage> {
    if (dto.rentalId) {
      await this.portalRentalsService.findOne(tenantId, customerId, dto.rentalId);
    }

    const message = await this.prisma.customerPortalMessage.create({
      data: {
        tenantId,
        customerId,
        rentalId: dto.rentalId ?? null,
        senderType: "CUSTOMER",
        body: dto.body,
        readByCustomerAt: new Date(),
      },
    });

    await this.auditService.log({
      tenantId,
      userId: null,
      action: "customer_portal.message_sent",
      entityType: "Customer",
      entityId: customerId,
      metadata: { messageId: message.id, senderType: "CUSTOMER" },
    });

    return message;
  }

  async sendAsStaff(
    tenantId: string,
    actorUserId: string,
    customerId: string,
    dto: SendPortalMessageDto,
  ): Promise<CustomerPortalMessage> {
    if (dto.rentalId) {
      const rental = await this.prisma.rental.findFirst({
        where: { id: dto.rentalId, tenantId, customerId, deletedAt: null },
      });
      if (!rental) {
        throw new BadRequestException("Rental does not belong to this customer");
      }
    }

    const message = await this.prisma.customerPortalMessage.create({
      data: {
        tenantId,
        customerId,
        rentalId: dto.rentalId ?? null,
        senderType: "STAFF",
        senderUserId: actorUserId,
        body: dto.body,
        readByStaffAt: new Date(),
      },
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "customer_portal.message_sent",
      entityType: "Customer",
      entityId: customerId,
      metadata: { messageId: message.id, senderType: "STAFF" },
    });

    await this.notificationsService.create({
      tenantId,
      customerId,
      type: "MESSAGE",
      title: "New message",
      body: dto.body.length > 140 ? `${dto.body.slice(0, 140)}…` : dto.body,
      link: dto.rentalId ? `/portal/rentals/${dto.rentalId}` : "/portal/messages",
    });

    return message;
  }

  async findMany(
    tenantId: string,
    customerId: string,
    rentalId?: string,
  ): Promise<CustomerPortalMessage[]> {
    const messages = await this.prisma.customerPortalMessage.findMany({
      where: { tenantId, customerId, ...(rentalId ? { rentalId } : {}) },
      orderBy: { createdAt: "asc" },
    });

    await this.prisma.customerPortalMessage.updateMany({
      where: {
        tenantId,
        customerId,
        senderType: "STAFF",
        readByCustomerAt: null,
        ...(rentalId ? { rentalId } : {}),
      },
      data: { readByCustomerAt: new Date() },
    });

    return messages;
  }

  async findManyForStaff(
    tenantId: string,
    customerId: string,
    rentalId?: string,
  ): Promise<CustomerPortalMessage[]> {
    const messages = await this.prisma.customerPortalMessage.findMany({
      where: { tenantId, customerId, ...(rentalId ? { rentalId } : {}) },
      orderBy: { createdAt: "asc" },
    });

    await this.prisma.customerPortalMessage.updateMany({
      where: {
        tenantId,
        customerId,
        senderType: "CUSTOMER",
        readByStaffAt: null,
        ...(rentalId ? { rentalId } : {}),
      },
      data: { readByStaffAt: new Date() },
    });

    return messages;
  }
}
