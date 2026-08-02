import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import { PortalNotificationsService } from "../notifications/portal-notifications.service";
import { toPortalRentalListItem, type PortalRentalListItem } from "../rentals/portal-rental.types";

export interface PortalDashboardSummary {
  currentRentalsCount: number;
  upcomingRentalsCount: number;
  recentRentals: PortalRentalListItem[];
  unreadMessagesCount: number;
  unreadNotificationsCount: number;
  pendingSignatureRequestsCount: number;
  pendingExtensionRequestsCount: number;
}

/**
 * A single aggregate read for the portal home screen — every number here
 * is a plain count query against tables already owned by another module
 * (Rentals, Documents' DocumentSignatureRequest, this module's own
 * messages/notifications/extension-requests); nothing is computed that
 * isn't already derivable from existing services, this just saves the
 * frontend from firing five separate requests on page load.
 */
@Injectable()
export class PortalDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: PortalNotificationsService,
  ) {}

  async summary(tenantId: string, customerId: string): Promise<PortalDashboardSummary> {
    const [
      currentRentalsCount,
      upcomingRentalsCount,
      recentRentalsRaw,
      unreadMessagesCount,
      unreadNotificationsCount,
      pendingSignatureRequestsCount,
      pendingExtensionRequestsCount,
    ] = await Promise.all([
      this.prisma.rental.count({ where: { tenantId, customerId, status: "ACTIVE" } }),
      this.prisma.rental.count({ where: { tenantId, customerId, status: "RESERVED" } }),
      this.prisma.rental.findMany({
        where: { tenantId, customerId, deletedAt: null },
        include: { customer: true, _count: { select: { items: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      this.prisma.customerPortalMessage.count({
        where: { tenantId, customerId, senderType: "STAFF", readByCustomerAt: null },
      }),
      this.notificationsService.unreadCount(tenantId, customerId),
      this.prisma.documentSignatureRequest.count({
        where: {
          tenantId,
          status: { in: ["REQUESTED", "PENDING"] },
          document: { customerId },
        },
      }),
      this.prisma.rentalExtensionRequest.count({
        where: { tenantId, customerId, status: "PENDING" },
      }),
    ]);

    const recentRentals = recentRentalsRaw.map(({ _count, ...rental }) =>
      toPortalRentalListItem({ ...rental, itemCount: _count.items }),
    );

    return {
      currentRentalsCount,
      upcomingRentalsCount,
      recentRentals,
      unreadMessagesCount,
      unreadNotificationsCount,
      pendingSignatureRequestsCount,
      pendingExtensionRequestsCount,
    };
  }
}
