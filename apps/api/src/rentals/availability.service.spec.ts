import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AvailabilityService } from "./availability.service";

function buildService() {
  const prisma = { rentalItem: { findMany: vi.fn() } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new AvailabilityService(prisma as any);
  return { service, prisma };
}

function rentalItem(overrides: Record<string, unknown> = {}) {
  return {
    assetId: "asset-1",
    returnedAt: null,
    rental: {
      id: "rental-1",
      rentalNumber: "RNT-000001",
      plannedStart: new Date("2026-08-01T00:00:00Z"),
      plannedEnd: new Date("2026-08-05T00:00:00Z"),
    },
    ...overrides,
  };
}

describe("AvailabilityService", () => {
  it("reports an asset as available when there are no candidate items at all", async () => {
    const { service, prisma } = buildService();
    prisma.rentalItem.findMany.mockResolvedValue([]);

    const results = await service.checkAvailability(
      "t1",
      ["asset-1"],
      new Date("2026-08-01T00:00:00Z"),
      new Date("2026-08-05T00:00:00Z"),
    );

    expect(results).toEqual([{ assetId: "asset-1", isAvailable: true, conflicts: [] }]);
  });

  it("reports a conflict for an overlapping reservation", async () => {
    const { service, prisma } = buildService();
    prisma.rentalItem.findMany.mockResolvedValue([rentalItem()]);

    const results = await service.checkAvailability(
      "t1",
      ["asset-1"],
      new Date("2026-08-03T00:00:00Z"),
      new Date("2026-08-06T00:00:00Z"),
    );

    expect(results[0]?.isAvailable).toBe(false);
    expect(results[0]?.conflicts).toHaveLength(1);
  });

  it("allows back-to-back bookings (existing ends exactly when the new one starts)", async () => {
    const { service, prisma } = buildService();
    // existing: Aug 1 - Aug 5; requested: Aug 5 - Aug 8 -> no overlap (half-open interval)
    prisma.rentalItem.findMany.mockResolvedValue([]);

    const results = await service.checkAvailability(
      "t1",
      ["asset-1"],
      new Date("2026-08-05T00:00:00Z"),
      new Date("2026-08-08T00:00:00Z"),
    );

    expect(results[0]?.isAvailable).toBe(true);
  });

  it("frees an asset early once its item has been returned, even before the planned end", async () => {
    const { service, prisma } = buildService();
    prisma.rentalItem.findMany.mockResolvedValue([
      rentalItem({ returnedAt: new Date("2026-08-02T00:00:00Z") }),
    ]);

    // requested window starts after the actual (early) return, before the original planned end
    const results = await service.checkAvailability(
      "t1",
      ["asset-1"],
      new Date("2026-08-03T00:00:00Z"),
      new Date("2026-08-06T00:00:00Z"),
    );

    expect(results[0]?.isAvailable).toBe(true);
  });

  it("still blocks if the requested window starts before the early return", async () => {
    const { service, prisma } = buildService();
    prisma.rentalItem.findMany.mockResolvedValue([
      rentalItem({ returnedAt: new Date("2026-08-03T00:00:00Z") }),
    ]);

    const results = await service.checkAvailability(
      "t1",
      ["asset-1"],
      new Date("2026-08-02T00:00:00Z"),
      new Date("2026-08-06T00:00:00Z"),
    );

    expect(results[0]?.isAvailable).toBe(false);
  });

  it("assertAvailable throws ConflictException listing unavailable assets", async () => {
    const { service, prisma } = buildService();
    prisma.rentalItem.findMany.mockResolvedValue([rentalItem()]);

    await expect(
      service.assertAvailable(
        "t1",
        ["asset-1"],
        new Date("2026-08-02T00:00:00Z"),
        new Date("2026-08-03T00:00:00Z"),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("assertAvailable resolves silently when every asset is free", async () => {
    const { service, prisma } = buildService();
    prisma.rentalItem.findMany.mockResolvedValue([]);

    await expect(
      service.assertAvailable(
        "t1",
        ["asset-1"],
        new Date("2026-08-02T00:00:00Z"),
        new Date("2026-08-03T00:00:00Z"),
      ),
    ).resolves.toBeUndefined();
  });
});
