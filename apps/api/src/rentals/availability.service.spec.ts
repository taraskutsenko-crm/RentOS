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
      // No `status` by default — deriveOverdueStatus only ever treats
      // status === "ACTIVE" as eligible for "overdue," so the many
      // existing tests below (none of which set a status) are unaffected
      // by the overdue logic regardless of how their fixture dates
      // compare to the real wall-clock "now" used internally.
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

  describe("overdue returns", () => {
    const NOW = new Date("2026-08-29T12:00:00Z");

    function withFakeNow<T>(fn: () => Promise<T> | T): Promise<T> {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      return Promise.resolve(fn()).finally(() => vi.useRealTimers());
    }

    it("keeps blocking an ACTIVE, unreturned item past its planned end (does not silently release it)", () =>
      withFakeNow(async () => {
        const { service, prisma } = buildService();
        prisma.rentalItem.findMany.mockResolvedValue([
          rentalItem({
            rental: {
              id: "rental-1",
              rentalNumber: "RNT-000001",
              status: "ACTIVE",
              plannedStart: new Date("2026-08-24T09:00:00Z"),
              plannedEnd: new Date("2026-08-27T15:00:00Z"), // already passed
            },
          }),
        ]);

        // Checking availability "now" — the same query shape checkAvailableNow uses.
        const results = await service.checkAvailability("t1", ["asset-1"], NOW, NOW);

        expect(results[0]?.isAvailable).toBe(false);
        expect(results[0]?.conflicts[0]).toMatchObject({
          isOverdue: true,
          overdueSince: "2026-08-27T15:00:00.000Z",
        });
      }));

    it("keeps blocking a far-future requested window too — overdue never has a known end", () =>
      withFakeNow(async () => {
        const { service, prisma } = buildService();
        prisma.rentalItem.findMany.mockResolvedValue([
          rentalItem({
            rental: {
              id: "rental-1",
              rentalNumber: "RNT-000001",
              status: "ACTIVE",
              plannedStart: new Date("2026-08-24T09:00:00Z"),
              plannedEnd: new Date("2026-08-27T15:00:00Z"),
            },
          }),
        ]);

        const results = await service.checkAvailability(
          "t1",
          ["asset-1"],
          new Date("2026-12-01T00:00:00Z"),
          new Date("2026-12-05T00:00:00Z"),
        );

        expect(results[0]?.isAvailable).toBe(false);
      }));

    it("stops blocking once the overdue item is actually returned", () =>
      withFakeNow(async () => {
        const { service, prisma } = buildService();
        prisma.rentalItem.findMany.mockResolvedValue([
          rentalItem({
            returnedAt: new Date("2026-08-29T10:00:00Z"), // returned this morning
            rental: {
              id: "rental-1",
              rentalNumber: "RNT-000001",
              status: "ACTIVE",
              plannedStart: new Date("2026-08-24T09:00:00Z"),
              plannedEnd: new Date("2026-08-27T15:00:00Z"),
            },
          }),
        ]);

        const results = await service.checkAvailability("t1", ["asset-1"], NOW, NOW);

        expect(results[0]?.isAvailable).toBe(true);
        expect(results[0]?.conflicts).toEqual([]);
      }));

    it("does not mark a conflict overdue merely because the rental is ACTIVE and still on track (plannedEnd in the future)", () =>
      withFakeNow(async () => {
        const { service, prisma } = buildService();
        prisma.rentalItem.findMany.mockResolvedValue([
          rentalItem({
            rental: {
              id: "rental-1",
              rentalNumber: "RNT-000001",
              status: "ACTIVE",
              plannedStart: new Date("2026-08-28T00:00:00Z"),
              plannedEnd: new Date("2026-09-01T00:00:00Z"), // still ahead
            },
          }),
        ]);

        const results = await service.checkAvailability("t1", ["asset-1"], NOW, NOW);

        expect(results[0]?.isAvailable).toBe(false);
        expect(results[0]?.conflicts[0]?.isOverdue).toBe(false);
        expect(results[0]?.conflicts[0]?.overdueSince).toBeNull();
      }));

    it("does not mark a RESERVED (not yet started) item overdue, even with a past plannedEnd", () =>
      withFakeNow(async () => {
        const { service, prisma } = buildService();
        prisma.rentalItem.findMany.mockResolvedValue([
          rentalItem({
            rental: {
              id: "rental-1",
              rentalNumber: "RNT-000001",
              status: "RESERVED",
              plannedStart: new Date("2026-08-01T00:00:00Z"),
              plannedEnd: new Date("2026-08-05T00:00:00Z"), // in the past, but never started
            },
          }),
        ]);

        // RESERVED with a past plannedEnd behaves exactly as before this
        // change: bounded by plannedEnd, so it does not block "now".
        const results = await service.checkAvailability("t1", ["asset-1"], NOW, NOW);

        expect(results[0]?.isAvailable).toBe(true);
      }));

    // Boundary: exactly at the planned-end instant. Same half-open
    // convention as the rest of the engine ("allows back-to-back
    // bookings" — an item ending exactly when a query starts does not
    // conflict): not overdue, and the query window it's being checked
    // against is released right at that instant, same as before this change.
    it("boundary: is not overdue and is available at the exact planned-end instant (same half-open turnover rule as everywhere else)", () =>
      withFakeNow(async () => {
        const { service, prisma } = buildService();
        prisma.rentalItem.findMany.mockResolvedValue([
          rentalItem({
            rental: {
              id: "rental-1",
              rentalNumber: "RNT-000001",
              status: "ACTIVE",
              plannedStart: new Date("2026-08-24T00:00:00Z"),
              plannedEnd: NOW, // planned end is exactly "now"
            },
          }),
        ]);

        const results = await service.checkAvailability("t1", ["asset-1"], NOW, NOW);

        expect(results[0]?.isAvailable).toBe(true);
      }));

    it("boundary: becomes overdue and stays blocked one millisecond after the planned-end instant, still unreturned", () =>
      withFakeNow(async () => {
        const { service, prisma } = buildService();
        prisma.rentalItem.findMany.mockResolvedValue([
          rentalItem({
            rental: {
              id: "rental-1",
              rentalNumber: "RNT-000001",
              status: "ACTIVE",
              plannedStart: new Date("2026-08-24T00:00:00Z"),
              plannedEnd: new Date(NOW.getTime() - 1), // one ms before "now"
            },
          }),
        ]);

        const results = await service.checkAvailability("t1", ["asset-1"], NOW, NOW);

        expect(results[0]?.isAvailable).toBe(false);
        expect(results[0]?.conflicts[0]?.isOverdue).toBe(true);
      }));
  });
});

describe("AvailabilityService.checkAvailableNow", () => {
  it("queries the engine with a zero-width [now, now) window — the same half-open math, at a single instant", async () => {
    const { service, prisma } = buildService();
    const now = new Date("2026-08-29T12:00:00Z");

    await service.checkAvailableNow("t1", ["asset-1"], now);

    expect(prisma.rentalItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          // The candidate query considers actualStart when present (an
          // ACTIVE rental's real occupancy window) and only falls back to
          // plannedStart for a not-yet-started RESERVED rental — see
          // checkAvailability's own doc comment on this exact fix.
          rental: expect.objectContaining({
            OR: [
              { actualStart: { lt: now } },
              { actualStart: null, plannedStart: { lt: now } },
            ],
          }),
        }),
      }),
    );
    expect(prisma.assetAvailabilityBlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ startAt: { lt: now }, endAt: { gt: now } }),
      }),
    );
  });

  it("defaults to the real current instant when `now` is omitted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T12:00:00Z"));
    try {
      const { service, prisma } = buildService();

      await service.checkAvailableNow("t1", ["asset-1"]);

      expect(prisma.rentalItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            rental: expect.objectContaining({
              OR: [
                { actualStart: { lt: new Date("2026-08-29T12:00:00Z") } },
                { actualStart: null, plannedStart: { lt: new Date("2026-08-29T12:00:00Z") } },
              ],
            }),
          }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("a rental in progress right now (started before, not yet ended) reports unavailable", async () => {
    const { service, prisma } = buildService();
    const now = new Date("2026-08-05T00:00:00Z");
    prisma.rentalItem.findMany.mockResolvedValue([
      rentalItem({
        rental: {
          id: "rental-1",
          rentalNumber: "RNT-000001",
          plannedStart: new Date("2026-08-01T00:00:00Z"), // started 4 days ago
          plannedEnd: new Date("2026-08-10T00:00:00Z"), // ends in 5 days
        },
      }),
    ]);

    const results = await service.checkAvailableNow("t1", ["asset-1"], now);

    expect(results[0]?.isAvailable).toBe(false);
  });

  it("a rental that hasn't started yet (future) does not report unavailable today", async () => {
    const { service, prisma } = buildService();
    const now = new Date("2026-08-05T00:00:00Z");
    // The DB-side filter (rental.plannedStart < now) already excludes a
    // future rental from candidateItems entirely in real Postgres — the
    // real end-to-end proof of this is the e2e test, this unit test
    // documents that an empty candidate set (what the future-rental case
    // resolves to) correctly reports available.
    prisma.rentalItem.findMany.mockResolvedValue([]);

    const results = await service.checkAvailableNow("t1", ["asset-1"], now);

    expect(results[0]?.isAvailable).toBe(true);
  });

  it("a rental that already ended does not report unavailable today", async () => {
    const { service, prisma } = buildService();
    const now = new Date("2026-08-05T00:00:00Z");
    prisma.rentalItem.findMany.mockResolvedValue([
      rentalItem({
        rental: {
          id: "rental-1",
          rentalNumber: "RNT-000001",
          plannedStart: new Date("2026-07-01T00:00:00Z"),
          plannedEnd: new Date("2026-07-05T00:00:00Z"), // ended a month ago
        },
      }),
    ]);

    const results = await service.checkAvailableNow("t1", ["asset-1"], now);

    expect(results[0]?.isAvailable).toBe(true);
  });
});
