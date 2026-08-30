import { Injectable, NotFoundException } from "@nestjs/common";

import type { PaginatedResult } from "../../customers/customers.service";
import { PrismaService } from "../../prisma/prisma.service";
import { RentalsService } from "../../rentals/rentals.service";
import type { RentalTimelineEvent } from "../../rentals/timeline.types";
import type { QueryPortalRentalsDto } from "../dto/query-portal-rentals.dto";
import {
  toPortalRentalDetail,
  toPortalRentalListItem,
  type PortalRentalDetail,
  type PortalRentalListItem,
} from "./portal-rental.types";

/**
 * A thin, ownership-enforcing wrapper around RentalsService — no rental
 * business logic (pricing, availability, lifecycle) is duplicated here.
 * RentalsService.findOne/timeline don't themselves filter by customer (a
 * staff caller may look up any rental in the tenant), so this layer adds
 * that check on top, returning the exact same 404 shape whether the rental
 * doesn't exist or belongs to a different customer — never distinguishing
 * the two, so a customer can't probe for another customer's rental ids.
 */
@Injectable()
export class PortalRentalsService {
  constructor(
    private readonly rentalsService: RentalsService,
    private readonly prisma: PrismaService,
  ) {}

  async findMany(
    tenantId: string,
    customerId: string,
    query: QueryPortalRentalsDto,
  ): Promise<PaginatedResult<PortalRentalListItem>> {
    const result = await this.rentalsService.findMany(tenantId, { ...query, customerId });
    return { ...result, items: result.items.map(toPortalRentalListItem) };
  }

  async findOne(tenantId: string, customerId: string, id: string): Promise<PortalRentalDetail> {
    const rental = await this.rentalsService.findOne(tenantId, id);
    if (rental.customerId !== customerId) {
      throw new NotFoundException("Rental not found");
    }
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { timezone: true },
    });
    return toPortalRentalDetail(rental, tenant.timezone);
  }

  async timeline(tenantId: string, customerId: string, id: string): Promise<RentalTimelineEvent[]> {
    await this.findOne(tenantId, customerId, id);
    return this.rentalsService.timeline(tenantId, id);
  }
}
