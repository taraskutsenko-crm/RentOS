import { describe, expect, it, vi } from "vitest";

import { generateQuoteNumber } from "./quote-numbering.util";

function buildTx(lastNumber: number) {
  return { $queryRaw: vi.fn().mockResolvedValue([{ lastNumber }]) };
}

describe("generateQuoteNumber", () => {
  it("formats as Q-<year>-<6-digit padded number>", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = buildTx(1) as any;
    const result = await generateQuoteNumber(tx, "tenant-1", new Date("2026-03-15T00:00:00Z"));
    expect(result).toBe("Q-2026-000001");
  });

  it("pads numbers up to 6 digits without truncating larger ones", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = buildTx(42) as any;
    const result = await generateQuoteNumber(tx, "tenant-1", new Date("2026-01-01T00:00:00Z"));
    expect(result).toBe("Q-2026-000042");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txBig = buildTx(1_234_567) as any;
    const resultBig = await generateQuoteNumber(
      txBig,
      "tenant-1",
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(resultBig).toBe("Q-2026-1234567");
  });

  it("uses the UTC year of issueDate, not the host's local timezone", async () => {
    // Dec 31 23:30 UTC — a host in a positive-UTC-offset timezone reading
    // this via local getters would see Jan 1 of the next year.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = buildTx(1) as any;
    const result = await generateQuoteNumber(tx, "tenant-1", new Date("2026-12-31T23:30:00Z"));
    expect(result).toBe("Q-2026-000001");
  });

  it("issues the upsert against the tenantId/year the caller passed in", async () => {
    const tx = buildTx(5);
    await generateQuoteNumber(tx as never, "tenant-42", new Date("2027-06-01T00:00:00Z"));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = tx.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join("")).toContain("ON CONFLICT");
    expect(values).toContain("tenant-42");
    expect(values).toContain(2027);
  });

  it("throws if the sequence upsert unexpectedly returns no row", async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
    await expect(
      generateQuoteNumber(tx as never, "tenant-1", new Date("2026-01-01T00:00:00Z")),
    ).rejects.toThrow(/no row/i);
  });
});
