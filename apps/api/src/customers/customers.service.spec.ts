import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CustomersService } from "./customers.service";

function buildService() {
  const prisma = {
    customer: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const auditService = { log: vi.fn() };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new CustomersService(prisma as any, auditService as any);
  return { service, prisma, auditService };
}

describe("CustomersService", () => {
  it("create() scopes the row to the given tenant and logs an audit entry", async () => {
    const { service, prisma, auditService } = buildService();
    prisma.customer.create.mockResolvedValue({ id: "c1", tenantId: "t1" });

    const result = await service.create("t1", "u1", {
      firstName: "A",
      lastName: "B",
    } as never);

    expect(prisma.customer.create).toHaveBeenCalledWith({
      data: { firstName: "A", lastName: "B", tenantId: "t1" },
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "customer.created", tenantId: "t1", userId: "u1" }),
    );
    expect(result).toEqual({ id: "c1", tenantId: "t1" });
  });

  it("findOne() throws NotFoundException when no row matches the tenant-scoped where clause", async () => {
    const { service, prisma } = buildService();
    prisma.customer.findFirst.mockResolvedValue(null);

    await expect(service.findOne("t1", "missing")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.customer.findFirst).toHaveBeenCalledWith({
      where: { id: "missing", tenantId: "t1", deletedAt: null },
    });
  });

  it("update() scopes the mutation's WHERE clause by tenantId, not just a pre-check", async () => {
    const { service, prisma } = buildService();
    prisma.customer.updateMany.mockResolvedValue({ count: 1 });
    prisma.customer.findFirst.mockResolvedValue({ id: "c1", tenantId: "t1", notes: "x" });

    await service.update("t1", "c1", "u1", { notes: "x" } as never);

    expect(prisma.customer.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", tenantId: "t1", deletedAt: null },
      data: { notes: "x" },
    });
  });

  it("update() throws NotFoundException if updateMany affects zero rows (wrong tenant or missing)", async () => {
    const { service, prisma } = buildService();
    prisma.customer.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.update("t1", "c1", "u1", {} as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("remove() soft-deletes via a tenant-scoped updateMany and logs an audit entry", async () => {
    const { service, prisma, auditService } = buildService();
    prisma.customer.updateMany.mockResolvedValue({ count: 1 });

    await service.remove("t1", "c1", "u1");

    expect(prisma.customer.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", tenantId: "t1", deletedAt: null },
      data: { deletedAt: expect.any(Date), status: "INACTIVE" },
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "customer.deleted" }),
    );
  });

  it("remove() throws NotFoundException if updateMany affects zero rows", async () => {
    const { service, prisma } = buildService();
    prisma.customer.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.remove("t1", "missing", "u1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("findMany() builds a tenant-scoped, non-deleted where clause with search/status filters", async () => {
    const { service, prisma } = buildService();
    prisma.customer.findMany.mockResolvedValue([]);
    prisma.customer.count.mockResolvedValue(0);

    await service.findMany("t1", { page: 2, pageSize: 10, search: "acme", status: "ACTIVE" });

    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "t1",
          deletedAt: null,
          status: "ACTIVE",
          OR: expect.any(Array),
        }),
        skip: 10,
        take: 10,
      }),
    );
  });
});
