import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AssetCategoriesService } from "./asset-categories.service";

function buildService() {
  const prisma = {
    assetCategory: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    asset: {
      count: vi.fn(),
    },
  };
  const auditService = { log: vi.fn() };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new AssetCategoriesService(prisma as any, auditService as any);
  return { service, prisma, auditService };
}

describe("AssetCategoriesService", () => {
  it("create() scopes the row to the tenant and rejects a duplicate name within the same parent", async () => {
    const { service, prisma } = buildService();
    prisma.assetCategory.findFirst.mockResolvedValue({ id: "existing" });

    await expect(
      service.create("t1", "u1", { name: "Vehicles", parentId: null } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("create() allows a root-level category when no name clash exists", async () => {
    const { service, prisma, auditService } = buildService();
    prisma.assetCategory.findFirst.mockResolvedValue(null); // assertNameUnique: no clash
    prisma.assetCategory.create.mockResolvedValue({ id: "c1", tenantId: "t1", name: "Tools" });

    const result = await service.create("t1", "u1", { name: "Tools" } as never);

    expect(prisma.assetCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: "t1", parentId: null }),
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "asset_category.created" }),
    );
    expect(result).toEqual({ id: "c1", tenantId: "t1", name: "Tools" });
  });

  it("update() rejects setting a category as its own parent", async () => {
    const { service, prisma } = buildService();
    prisma.assetCategory.findFirst.mockResolvedValue({
      id: "c1",
      tenantId: "t1",
      parentId: null,
      name: "Vehicles",
      deletedAt: null,
    });

    await expect(
      service.update("t1", "c1", "u1", { parentId: "c1" } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("update() rejects a parent change that would create a cycle", async () => {
    const { service, prisma } = buildService();
    // current category: c1, no parent
    prisma.assetCategory.findFirst
      .mockResolvedValueOnce({
        id: "c1",
        tenantId: "t1",
        parentId: null,
        name: "A",
        deletedAt: null,
      }) // findOne
      .mockResolvedValueOnce({ id: "c2", tenantId: "t1", deletedAt: null }); // assertParentBelongsToTenant(c2)

    // cycle walk: c2 -> c1 (c2's parent is c1, which is the id we're moving) => cycle
    prisma.assetCategory.findFirst.mockResolvedValueOnce({ parentId: "c1" }); // walk from c2

    await expect(
      service.update("t1", "c1", "u1", { parentId: "c2" } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("remove() rejects deletion when active assets reference the category", async () => {
    const { service, prisma } = buildService();
    prisma.assetCategory.findFirst.mockResolvedValue({ id: "c1", tenantId: "t1", deletedAt: null });
    prisma.asset.count.mockResolvedValue(2);
    prisma.assetCategory.count.mockResolvedValue(0);

    await expect(service.remove("t1", "c1", "u1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("remove() rejects deletion when active subcategories exist", async () => {
    const { service, prisma } = buildService();
    prisma.assetCategory.findFirst.mockResolvedValue({ id: "c1", tenantId: "t1", deletedAt: null });
    prisma.asset.count.mockResolvedValue(0);
    prisma.assetCategory.count.mockResolvedValue(1);

    await expect(service.remove("t1", "c1", "u1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("remove() soft-deletes when no active references exist", async () => {
    const { service, prisma, auditService } = buildService();
    prisma.assetCategory.findFirst.mockResolvedValue({ id: "c1", tenantId: "t1", deletedAt: null });
    prisma.asset.count.mockResolvedValue(0);
    prisma.assetCategory.count.mockResolvedValue(0);
    prisma.assetCategory.update.mockResolvedValue({ id: "c1" });

    await service.remove("t1", "c1", "u1");

    expect(prisma.assetCategory.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "asset_category.deleted" }),
    );
  });

  it("findOne() throws NotFoundException for a category outside the tenant", async () => {
    const { service, prisma } = buildService();
    prisma.assetCategory.findFirst.mockResolvedValue(null);

    await expect(service.findOne("t1", "missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});
