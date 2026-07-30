import { describe, expect, it, vi } from "vitest";

import { generateRentalNumber } from "./rental-numbering.util";

function buildTx(lastNumber: number) {
  return { $queryRaw: vi.fn().mockResolvedValue([{ lastNumber }]) };
}

/**
 * Pure formatting/query-shape coverage against a mocked transaction
 * client — the real concurrency guarantee (the atomic upsert is actually
 * race-free under contention) is covered separately in
 * test/rental-numbering.e2e-spec.ts against a real Postgres database,
 * since a mocked helper can't prove that.
 */
describe("generateRentalNumber", () => {
  it("formats as RNT-<6-digit padded number>", async () => {
    const tx = buildTx(1);
    const result = await generateRentalNumber(tx as never, "tenant-1");
    expect(result).toBe("RNT-000001");
  });

  it("pads numbers up to 6 digits without truncating larger ones", async () => {
    const tx = buildTx(42);
    const result = await generateRentalNumber(tx as never, "tenant-1");
    expect(result).toBe("RNT-000042");

    const txBig = buildTx(1_234_567);
    const resultBig = await generateRentalNumber(txBig as never, "tenant-1");
    expect(resultBig).toBe("RNT-1234567");
  });

  it("issues the upsert against the tenantId the caller passed in, with no year dimension", async () => {
    const tx = buildTx(5);
    await generateRentalNumber(tx as never, "tenant-42");
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = tx.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join("")).toContain("ON CONFLICT");
    expect(strings.join("")).toContain("rental_sequences");
    expect(values).toContain("tenant-42");
  });

  it("throws if the sequence upsert unexpectedly returns no row", async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
    await expect(generateRentalNumber(tx as never, "tenant-1")).rejects.toThrow(/no row/i);
  });
});
