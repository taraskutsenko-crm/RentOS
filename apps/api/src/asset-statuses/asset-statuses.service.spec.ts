import { ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AssetStatusesService } from "./asset-statuses.service";
import { SYSTEM_STATUS_DEFINITIONS } from "./system-statuses";

function buildService() {
  const prisma = {
    assetStatusDefinition: {
      createMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    asset: {
      count: vi.fn(),
    },
  };
  const auditService = { log: vi.fn() };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new AssetStatusesService(prisma as any, auditService as any);
  return { service, prisma, auditService };
}

describe("AssetStatusesService", () => {
  it("seedSystemStatuses() idempotently creates all 8 system statuses with skipDuplicates", async () => {
    const { service, prisma } = buildService();
    prisma.assetStatusDefinition.createMany.mockResolvedValue({ count: 8 });

    await service.seedSystemStatuses("t1");

    expect(prisma.assetStatusDefinition.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining(
          SYSTEM_STATUS_DEFINITIONS.map((status) =>
            expect.objectContaining({ tenantId: "t1", code: status.code, isSystem: true }),
          ),
        ),
        skipDuplicates: true,
      }),
    );
  });

  it("only AVAILABLE is seeded as available-for-rental by default", () => {
    const available = SYSTEM_STATUS_DEFINITIONS.filter((status) => status.isAvailableForRental);
    expect(available.map((status) => status.code)).toEqual(["AVAILABLE"]);
  });

  it("create() rejects a duplicate status code within the tenant", async () => {
    const { service, prisma } = buildService();
    prisma.assetStatusDefinition.findFirst.mockResolvedValue({ id: "existing", code: "CUSTOM" });

    await expect(
      service.create("t1", "u1", { name: "Custom", code: "CUSTOM" } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("update() rejects renaming a system status's code", async () => {
    const { service, prisma } = buildService();
    prisma.assetStatusDefinition.findFirst.mockResolvedValue({
      id: "s1",
      tenantId: "t1",
      code: "AVAILABLE",
      isSystem: true,
      deletedAt: null,
    });

    await expect(
      service.update("t1", "s1", "u1", { code: "RENAMED" } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("update() allows renaming a system status's display name", async () => {
    const { service, prisma } = buildService();
    prisma.assetStatusDefinition.findFirst.mockResolvedValue({
      id: "s1",
      tenantId: "t1",
      code: "AVAILABLE",
      isSystem: true,
      deletedAt: null,
    });
    prisma.assetStatusDefinition.update.mockResolvedValue({ id: "s1", name: "Ready to rent" });

    await service.update("t1", "s1", "u1", { name: "Ready to rent" } as never);

    expect(prisma.assetStatusDefinition.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Ready to rent" }) }),
    );
  });

  it("remove() rejects deleting a system status", async () => {
    const { service, prisma } = buildService();
    prisma.assetStatusDefinition.findFirst.mockResolvedValue({
      id: "s1",
      tenantId: "t1",
      isSystem: true,
      deletedAt: null,
    });

    await expect(service.remove("t1", "s1", "u1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("remove() rejects deleting a status currently used by assets", async () => {
    const { service, prisma } = buildService();
    prisma.assetStatusDefinition.findFirst.mockResolvedValue({
      id: "s1",
      tenantId: "t1",
      isSystem: false,
      deletedAt: null,
    });
    prisma.asset.count.mockResolvedValue(3);

    await expect(service.remove("t1", "s1", "u1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("remove() soft-deletes a custom, unused status", async () => {
    const { service, prisma, auditService } = buildService();
    prisma.assetStatusDefinition.findFirst.mockResolvedValue({
      id: "s1",
      tenantId: "t1",
      isSystem: false,
      deletedAt: null,
    });
    prisma.asset.count.mockResolvedValue(0);
    prisma.assetStatusDefinition.update.mockResolvedValue({ id: "s1" });

    await service.remove("t1", "s1", "u1");

    expect(prisma.assetStatusDefinition.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: expect.any(Date), isActive: false }),
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "asset_status.deleted" }),
    );
  });
});
