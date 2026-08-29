import { describe, expect, it, vi } from "vitest";

import { AssetsService } from "./assets.service";

function buildService() {
  const prisma = {
    asset: {
      findFirst: vi.fn(),
    },
    assetImage: {
      findMany: vi.fn(),
    },
    assetDocument: {
      findMany: vi.fn(),
    },
    rentalItem: {
      findMany: vi.fn(),
    },
    document: {
      findMany: vi.fn(),
    },
  };
  const auditService = { log: vi.fn() };
  const assetStatusesService = {};
  const fieldValuesService = {
    getExistingValuesByKey: vi.fn().mockResolvedValue({}),
    attach: vi.fn((asset: unknown) => asset),
  };
  const availabilityService = { checkAvailableNow: vi.fn().mockResolvedValue([]) };

  const service = new AssetsService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma as any,
    auditService as never,
    assetStatusesService as never,
    fieldValuesService as never,
    availabilityService as never,
  );
  return { service, prisma };
}

const BASE_ASSET = {
  id: "a1",
  tenantId: "t1",
  currentLocationText: "Warehouse 3",
  currentStatus: { id: "s1", code: "AVAILABLE", name: "Available" },
};

describe("AssetsService.summary", () => {
  it("computes revenue read-time via computeItemLineTotalMinor, never a stored total", async () => {
    const { service, prisma } = buildService();
    prisma.asset.findFirst.mockResolvedValue(BASE_ASSET);
    prisma.assetImage.findMany.mockResolvedValue([]);
    prisma.assetDocument.findMany.mockResolvedValue([]);
    prisma.rentalItem.findMany.mockResolvedValue([
      {
        quantity: 1,
        billingMode: "DAILY",
        dailyPriceMinor: 1000,
        weeklyPriceMinor: null,
        monthlyPriceMinor: null,
        customPriceMinor: null,
        discountMinor: 0,
        monthlyBillingStrategy: null,
        customMonthLengthDays: null,
        rental: {
          plannedStart: new Date("2026-01-01T00:00:00Z"),
          plannedEnd: new Date("2026-01-03T00:00:00Z"),
          currency: "USD",
        },
      },
    ]);

    const result = await service.summary("t1", "a1");

    expect(prisma.rentalItem.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "t1",
        assetId: "a1",
        rental: {
          deletedAt: null,
          status: { in: ["RESERVED", "ACTIVE", "RETURNED", "COMPLETED"] },
        },
      },
      select: expect.objectContaining({ quantity: true, billingMode: true }),
    });
    // 2-day DAILY rental at 1000/day = 2000 minor units.
    expect(result).toEqual({
      totalRentals: 1,
      revenueGeneratedMinor: 2000,
      currency: "USD",
      currentStatus: { id: "s1", code: "AVAILABLE", name: "Available" },
      currentLocation: "Warehouse 3",
    });
  });

  it("returns zero revenue and null currency when the asset has no counted rentals", async () => {
    const { service, prisma } = buildService();
    prisma.asset.findFirst.mockResolvedValue(BASE_ASSET);
    prisma.assetImage.findMany.mockResolvedValue([]);
    prisma.assetDocument.findMany.mockResolvedValue([]);
    prisma.rentalItem.findMany.mockResolvedValue([]);

    const result = await service.summary("t1", "a1");

    expect(result.totalRentals).toBe(0);
    expect(result.revenueGeneratedMinor).toBe(0);
    expect(result.currency).toBeNull();
  });
});
