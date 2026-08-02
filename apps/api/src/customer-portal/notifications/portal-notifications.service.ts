import { Injectable, NotFoundException } from "@nestjs/common";
import type { CustomerNotification, CustomerNotificationType } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";

export interface CreatePortalNotificationInput {
  tenantId: string;
  customerId: string;
  type: CustomerNotificationType;
  title: string;
  body: string;
  /** Portal-relative path the notification should link to, e.g. "/portal/rentals/:id". */
  link?: string | null;
}

/**
 * In-app-only notifications (no email/push delivery pipeline — see
 * docs/adr/0012-customer-portal.md). Other portal services (messages,
 * extension requests, damage reports, documents) call `create()` after
 * their own write commits — never from inside another service's
 * transaction, the same "side effects happen after the transaction, not
 * inside it" discipline EmailService already follows.
 */
@Injectable()
export class PortalNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreatePortalNotificationInput): Promise<CustomerNotification> {
    return this.prisma.customerNotification.create({
      data: {
        tenantId: input.tenantId,
        customerId: input.customerId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
      },
    });
  }

  async findMany(
    tenantId: string,
    customerId: string,
    unreadOnly = false,
  ): Promise<CustomerNotification[]> {
    return this.prisma.customerNotification.findMany({
      where: { tenantId, customerId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async markRead(tenantId: string, customerId: string, id: string): Promise<CustomerNotification> {
    const result = await this.prisma.customerNotification.updateMany({
      where: { id, tenantId, customerId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await this.prisma.customerNotification.findFirst({
        where: { id, tenantId, customerId },
      });
      if (!exists) {
        throw new NotFoundException("Notification not found");
      }
      return exists;
    }
    return this.prisma.customerNotification.findFirstOrThrow({
      where: { id, tenantId, customerId },
    });
  }

  async markAllRead(tenantId: string, customerId: string): Promise<{ updated: number }> {
    const result = await this.prisma.customerNotification.updateMany({
      where: { tenantId, customerId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async unreadCount(tenantId: string, customerId: string): Promise<number> {
    return this.prisma.customerNotification.count({
      where: { tenantId, customerId, readAt: null },
    });
  }
}
