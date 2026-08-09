import { Injectable, NotFoundException } from "@nestjs/common";
import type { Customer, Document, Prisma, RentalStatus } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateCustomerDto } from "./dto/create-customer.dto";
import type { QueryCustomersDto } from "./dto/query-customers.dto";
import type { UpdateCustomerDto } from "./dto/update-customer.dto";
import type { CustomerSummary } from "./summary.types";
import type { CustomerTimelineEvent, CustomerTimelineEventType } from "./timeline.types";

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const CUSTOMER_DOCUMENT_SELECT = {
  id: true,
  documentType: true,
  customTypeName: true,
  documentNumber: true,
  status: true,
  title: true,
  createdAt: true,
} satisfies Prisma.DocumentSelect;

export type CustomerDocumentView = Pick<
  Document,
  "id" | "documentType" | "customTypeName" | "documentNumber" | "status" | "title" | "createdAt"
>;

export interface CustomerDetailView extends Customer {
  documents: CustomerDocumentView[];
}

const AUDIT_ACTION_TO_TIMELINE_TYPE: Record<string, CustomerTimelineEventType> = {
  "customer.created": "created",
  "customer.updated": "updated",
  "customer.deleted": "deleted",
};

/** Rentals that represent real, counted business activity — DRAFT and CANCELLED are excluded. */
const COUNTED_RENTAL_STATUSES: RentalStatus[] = ["RESERVED", "ACTIVE", "RETURNED", "COMPLETED"];

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(tenantId: string, actorUserId: string, dto: CreateCustomerDto): Promise<Customer> {
    const customer = await this.prisma.customer.create({
      data: { ...dto, tenantId },
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "customer.created",
      entityType: "Customer",
      entityId: customer.id,
    });

    return customer;
  }

  async findMany(tenantId: string, query: QueryCustomersDto): Promise<PaginatedResult<Customer>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.CustomerWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: "insensitive" } },
              { lastName: { contains: query.search, mode: "insensitive" } },
              { company: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(tenantId: string, id: string): Promise<CustomerDetailView> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    const documents = await this.prisma.document.findMany({
      where: { tenantId, customerId: id, deletedAt: null },
      select: CUSTOMER_DOCUMENT_SELECT,
      orderBy: { createdAt: "desc" },
    });
    return { ...customer, documents };
  }

  async update(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: UpdateCustomerDto,
  ): Promise<Customer> {
    // The where clause itself is tenant-scoped — not just a pre-check —
    // so a mutation can never cross a tenant boundary.
    const result = await this.prisma.customer.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: dto,
    });
    if (result.count === 0) {
      throw new NotFoundException("Customer not found");
    }

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "customer.updated",
      entityType: "Customer",
      entityId: id,
    });

    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string, actorUserId: string): Promise<void> {
    const result = await this.prisma.customer.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), status: "INACTIVE" },
    });
    if (result.count === 0) {
      throw new NotFoundException("Customer not found");
    }

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "customer.deleted",
      entityType: "Customer",
      entityId: id,
    });
  }

  /**
   * The customer's business history — created/updated/deleted, sourced
   * entirely from AuditLog. There is no CustomerStatusHistory model, so
   * unlike Assets/Rentals there is no status_changed event type here.
   */
  async timeline(tenantId: string, id: string): Promise<CustomerTimelineEvent[]> {
    await this.findOne(tenantId, id);

    const logs = await this.prisma.auditLog.findMany({
      where: {
        tenantId,
        entityType: "Customer",
        entityId: id,
        action: { in: Object.keys(AUDIT_ACTION_TO_TIMELINE_TYPE) },
      },
      orderBy: { createdAt: "asc" },
    });

    const events: CustomerTimelineEvent[] = logs.map((log) => ({
      id: log.id,
      type: AUDIT_ACTION_TO_TIMELINE_TYPE[log.action]!,
      occurredAt: log.createdAt.toISOString(),
      actorUserId: log.userId,
      data: (log.metadata as Record<string, unknown> | null) ?? {},
    }));

    return events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  /**
   * Generated summary shown at the top of the customer's Timeline page —
   * see docs/PRODUCT_BIBLE.md §12. totalRevenueMinor sums Rental.totalMinor
   * (the canonical stored total per ARCHITECTURE_LOCK §1.5) — never
   * recomputed. Fields with no real data source are simply omitted.
   */
  async summary(tenantId: string, id: string): Promise<CustomerSummary> {
    const customer = await this.findOne(tenantId, id);

    const [rentals, damageReportsCount, lastAuditLog] = await Promise.all([
      this.prisma.rental.findMany({
        where: {
          tenantId,
          customerId: id,
          deletedAt: null,
          status: { in: COUNTED_RENTAL_STATUSES },
        },
        select: { status: true, totalMinor: true, currency: true },
      }),
      this.prisma.rentalDamageReport.count({ where: { tenantId, customerId: id } }),
      this.prisma.auditLog.findFirst({
        where: { tenantId, entityType: "Customer", entityId: id },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return {
      customerSince: customer.createdAt.toISOString(),
      totalRentals: rentals.length,
      activeRentals: rentals.filter((rental) => rental.status === "ACTIVE").length,
      totalRevenueMinor: rentals.reduce((sum, rental) => sum + rental.totalMinor, 0),
      currency: rentals[0]?.currency ?? null,
      lastActivityAt: lastAuditLog?.createdAt.toISOString() ?? null,
      damageReportsCount,
    };
  }
}
