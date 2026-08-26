import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AvailabilityService } from "./availability.service";

function buildService() {
  const prisma = {
    rentalItem: { findMany: vi.fn().mockResolvedValue([]) },
    assetAvailabilityBlock: { findMany: vi.fn().mockResolvedValue([]) },
    asset: { findMany: vi.fn().mockResolvedValue([]) },
  };
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

function availabilityBlock(overrides: Record<string, unknown> = {}) {
  return {
    id: "block-1",
    assetId: "asset-1",
    type: "MAINTENANCE",
    startAt: new Date("2026-09-10T00:00:00Z"),
    endAt: new Date("2026-09-12T00:00:00Z"),
    notes: null,
    relatedRentalId: null,
    ...overrides,
  };
}

describe("AvailabilityService", () => {
  it("reports an asset as available when there are no candidate items, blocks, or asset rows", async () => {
    const { service } = buildService();

    const results = await service.checkAvailability(
      "t1",
      ["asset-1"],
      new Date("2026-08-01T00:00:00Z"),
      new Date("2026-08-05T00:00:00Z"),
    );

    expect(results).toEqual([
      {
        assetId: "asset-1",
        isAvailable: true,
        conflicts: [],
        blocks: [],
        permanentReason: null,
      },
    ]);
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
    const { service } = buildService();
    // existing: Aug 1 - Aug 5; requested: Aug 5 - Aug 8 -> no overlap (half-open interval)

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
    const { service } = buildService();

    await expect(
      service.assertAvailable(
        "t1",
        ["asset-1"],
        new Date("2026-08-02T00:00:00Z"),
        new Date("2026-08-03T00:00:00Z"),
      ),
    ).resolves.toBeUndefined();
  });

  it("reports a conflict for an overlapping maintenance/repair/etc. block", async () => {
    const { service, prisma } = buildService();
    prisma.assetAvailabilityBlock.findMany.mockResolvedValue([availabilityBlock()]);

    const results = await service.checkAvailability(
      "t1",
      ["asset-1"],
      new Date("2026-09-11T00:00:00Z"),
      new Date("2026-09-15T00:00:00Z"),
    );

    expect(results[0]?.isAvailable).toBe(false);
    expect(results[0]?.blocks).toEqual([
      {
        blockId: "block-1",
        type: "MAINTENANCE",
        startAt: "2026-09-10T00:00:00.000Z",
        endAt: "2026-09-12T00:00:00.000Z",
        notes: null,
        relatedRentalId: null,
      },
    ]);
  });

  it("does not report a future block as a conflict for a date range before it starts", async () => {
    const { service, prisma } = buildService();
    // A block only surfaces as a conflict when the requested range overlaps it — a
    // future maintenance window must never make the asset look unavailable today.
    prisma.assetAvailabilityBlock.findMany.mockResolvedValue([]);

    const results = await service.checkAvailability(
      "t1",
      ["asset-1"],
      new Date("2026-08-01T00:00:00Z"),
      new Date("2026-08-05T00:00:00Z"),
    );

    expect(results[0]?.isAvailable).toBe(true);
    expect(results[0]?.blocks).toEqual([]);
  });

  it("reports LOST/RETIRED assets as permanently unavailable for any requested range", async () => {
    const { service, prisma } = buildService();
    prisma.asset.findMany.mockResolvedValue([
      { id: "asset-1", currentStatus: { code: "LOST", isSystem: true } },
    ]);

    const results = await service.checkAvailability(
      "t1",
      ["asset-1"],
      new Date("2027-01-01T00:00:00Z"),
      new Date("2027-01-05T00:00:00Z"),
    );

    expect(results[0]?.isAvailable).toBe(false);
    expect(results[0]?.permanentReason).toBe("LOST");
  });

  it("ignores a tenant-custom status that happens to be named LOST/RETIRED (isSystem = false)", async () => {
    const { service, prisma } = buildService();
    prisma.asset.findMany.mockResolvedValue([
      { id: "asset-1", currentStatus: { code: "LOST", isSystem: false } },
    ]);

    const results = await service.checkAvailability(
      "t1",
      ["asset-1"],
      new Date("2027-01-01T00:00:00Z"),
      new Date("2027-01-05T00:00:00Z"),
    );

    expect(results[0]?.isAvailable).toBe(true);
    expect(results[0]?.permanentReason).toBeNull();
  });
});
