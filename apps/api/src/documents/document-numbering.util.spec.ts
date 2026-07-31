import { describe, expect, it, vi } from "vitest";

import { generateDocumentNumber } from "./document-numbering.util";

function buildTx(lastNumber: number) {
  return { $queryRaw: vi.fn().mockResolvedValue([{ lastNumber }]) };
}

/**
 * Pure formatting/query-shape coverage against a mocked transaction client —
 * the real concurrency guarantee is covered separately in
 * test/documents.e2e-spec.ts against a real Postgres database, mirroring
 * rental-numbering.util.spec.ts's identical split.
 */
describe("generateDocumentNumber", () => {
  it("formats a non-year-scoped type as <PREFIX>-<6-digit padded number>", async () => {
    const tx = buildTx(1);
    const result = await generateDocumentNumber(tx as never, "tenant-1", "CONTRACT", new Date());
    expect(result).toBe("CON-000001");
  });

  it("uses the documented prefix for every built-in non-CUSTOM type", async () => {
    const cases: [string, string][] = [
      ["CONTRACT", "CON"],
      ["HANDOVER_PROTOCOL", "HD"],
      ["RETURN_PROTOCOL", "RT"],
      ["DAMAGE_REPORT", "DMG"],
      ["CONTRACT_AMENDMENT", "AMD"],
    ];
    for (const [documentType, prefix] of cases) {
      const tx = buildTx(7);
      const result = await generateDocumentNumber(
        tx as never,
        "tenant-1",
        documentType as never,
        new Date(),
      );
      expect(result).toBe(`${prefix}-000007`);
    }
  });

  it("formats CUSTOM as DOC-<year>-<6-digit padded number>", async () => {
    const tx = buildTx(3);
    const result = await generateDocumentNumber(
      tx as never,
      "tenant-1",
      "CUSTOM",
      new Date("2026-05-01T00:00:00.000Z"),
    );
    expect(result).toBe("DOC-2026-000003");
  });

  it("pads numbers up to 6 digits without truncating larger ones", async () => {
    const tx = buildTx(1_234_567);
    const result = await generateDocumentNumber(tx as never, "tenant-1", "CONTRACT", new Date());
    expect(result).toBe("CON-1234567");
  });

  it("issues the upsert against the tenantId/documentType the caller passed in", async () => {
    const tx = buildTx(5);
    await generateDocumentNumber(tx as never, "tenant-42", "RETURN_PROTOCOL", new Date());
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = tx.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join("")).toContain("ON CONFLICT");
    expect(strings.join("")).toContain("document_sequences");
    expect(values).toContain("tenant-42");
    expect(values).toContain("RETURN_PROTOCOL");
  });

  it("uses the sentinel year 0 for non-year-scoped types (never a real calendar year)", async () => {
    const tx = buildTx(1);
    await generateDocumentNumber(tx as never, "tenant-1", "CONTRACT", new Date("2026-01-01"));
    const values = tx.$queryRaw.mock.calls[0]!.slice(1) as unknown[];
    expect(values).toContain(0);
  });

  it("throws if the sequence upsert unexpectedly returns no row", async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
    await expect(
      generateDocumentNumber(tx as never, "tenant-1", "CONTRACT", new Date()),
    ).rejects.toThrow(/no row/i);
  });
});
