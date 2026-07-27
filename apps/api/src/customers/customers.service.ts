import { Injectable, NotFoundException } from "@nestjs/common";
import type { Customer, Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateCustomerDto } from "./dto/create-customer.dto";
import type { QueryCustomersDto } from "./dto/query-customers.dto";
import type { UpdateCustomerDto } from "./dto/update-customer.dto";

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

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

  async findOne(tenantId: string, id: string): Promise<Customer> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    return customer;
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
}
