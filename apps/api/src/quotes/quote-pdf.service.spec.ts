import { PDFParse } from "pdf-parse";
import { describe, expect, it, vi } from "vitest";

import { QuotePdfService } from "./quote-pdf.service";
import type { QuoteDetailView } from "./quote.types";

async function extractText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function pageCount(buffer: Buffer): Promise<number> {
  const parser = new PDFParse({ data: buffer });
  try {
    const info = await parser.getInfo();
    return info.total;
  } finally {
    await parser.destroy();
  }
}

function buildQuote(overrides: Partial<QuoteDetailView> = {}): QuoteDetailView {
  return {
    id: "quote-1",
    tenantId: "tenant-1",
    customerId: "customer-1",
    quoteNumber: "Q-2026-000001",
    status: "DRAFT",
    issueDate: new Date("2026-08-01T00:00:00Z"),
    validUntil: new Date("2026-09-01T00:00:00Z"),
    plannedStart: new Date("2026-08-10T00:00:00Z"),
    plannedEnd: new Date("2026-08-17T00:00:00Z"),
    currency: "USD",
    subtotalMinor: 100_000,
    discountType: null,
    discountValue: 0,
    discountTotalMinor: 0,
    taxTotalMinor: 10_000,
    depositTotalMinor: 5_000,
    totalMinor: 100_000,
    customerNotes: "Please deliver before 9am.",
    internalNotes: null,
    termsAndConditions: "Standard rental terms apply.",
    acceptedAt: null,
    acceptedBy: null,
    rejectedAt: null,
    rejectionReason: null,
    publicTokenHash: null,
    publicTokenExpiresAt: null,
    duplicatedFromQuoteId: null,
    createdByUserId: "user-1",
    updatedByUserId: null,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    deletedAt: null,
    customer: {
      id: "customer-1",
      tenantId: "tenant-1",
      firstName: "Jane",
      lastName: "Doe",
      company: "Acme Events",
      phone: "+1 555 0100",
      email: "jane@example.com",
      vatNumber: null,
      address: null,
      notes: null,
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    },
    items: [
      {
        id: "item-1",
        tenantId: "tenant-1",
        quoteId: "quote-1",
        itemType: "ASSET",
        assetId: "asset-1",
        name: "Diesel generator 20kVA",
        description:
          "A very long description that should wrap across multiple lines within the table cell instead of being clipped or overflowing into the next column, covering delivery, setup, and safety instructions for on-site operation.",
        quantity: 2,
        unit: "day",
        billingMode: "DAILY",
        unitPriceMinor: null,
        dailyPriceMinor: 5_000,
        weeklyPriceMinor: null,
        monthlyPriceMinor: null,
        customPriceMinor: null,
        discountType: null,
        discountValue: 0,
        discountTotalMinor: 0,
        taxRateBp: 2_000,
        taxTotalMinor: 10_000,
        depositMinor: 5_000,
        lineSubtotalMinor: 50_000,
        lineTotalMinor: 60_000,
        sortOrder: 0,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        asset: null,
      },
      {
        id: "item-2",
        tenantId: "tenant-1",
        quoteId: "quote-1",
        itemType: "DELIVERY",
        assetId: null,
        name: "Доставка / Delivery / Dostawa",
        description: "Тестове кириличне поле для перевірки рендерингу шрифту.",
        quantity: 1,
        unit: null,
        billingMode: "FLAT",
        unitPriceMinor: 5_000,
        dailyPriceMinor: null,
        weeklyPriceMinor: null,
        monthlyPriceMinor: null,
        customPriceMinor: null,
        discountType: null,
        discountValue: 0,
        discountTotalMinor: 0,
        taxRateBp: 0,
        taxTotalMinor: 0,
        depositMinor: 0,
        lineSubtotalMinor: 5_000,
        lineTotalMinor: 5_000,
        sortOrder: 1,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        asset: null,
      },
      // Many additional rows to force a page break in the items table.
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `item-extra-${i}`,
        tenantId: "tenant-1",
        quoteId: "quote-1",
        itemType: "SERVICE" as const,
        assetId: null,
        name: `Service line ${i}`,
        description: "Repeated filler row to exercise multi-page rendering and page numbering.",
        quantity: 1,
        unit: null,
        billingMode: "FLAT" as const,
        unitPriceMinor: 100,
        dailyPriceMinor: null,
        weeklyPriceMinor: null,
        monthlyPriceMinor: null,
        customPriceMinor: null,
        discountType: null,
        discountValue: 0,
        discountTotalMinor: 0,
        taxRateBp: 0,
        taxTotalMinor: 0,
        depositMinor: 0,
        lineSubtotalMinor: 100,
        lineTotalMinor: 100,
        sortOrder: i + 2,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        asset: null,
      })),
    ],
    convertedRental: null,
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function buildService(tenantOverrides: { defaultLanguage?: string; timezone?: string } = {}) {
  const prisma = {
    tenant: {
      findUnique: vi.fn().mockResolvedValue({
        name: "Acme Rentals",
        defaultLanguage: tenantOverrides.defaultLanguage ?? "en",
        timezone: tenantOverrides.timezone ?? "UTC",
      }),
    },
    quoteDocument: {
      create: vi
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: "doc-1", createdAt: new Date(), deletedAt: null, ...data }),
        ),
      findFirst: vi.fn(),
    },
  };
  const storageService = {
    store: vi.fn().mockResolvedValue(undefined),
    read: vi.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new QuotePdfService(prisma as any, storageService as any);
  return { service, prisma, storageService };
}

describe("QuotePdfService.generateAndStore", () => {
  it("renders a valid, non-trivial PDF buffer and stores it", async () => {
    const { service, storageService, prisma } = buildService();
    const quote = buildQuote();

    const result = await service.generateAndStore("tenant-1", quote, "user-1");

    expect(result.buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(result.buffer.length).toBeGreaterThan(1_000);
    expect(storageService.store).toHaveBeenCalledTimes(1);
    expect(prisma.quoteDocument.create).toHaveBeenCalledTimes(1);
    expect(result.document.mimeType).toBe("application/pdf");
    expect(result.document.originalFileName).toBe("Q-2026-000001.pdf");
  });

  it("renders Cyrillic text as actual glyphs, not garbled/missing characters", async () => {
    const { service } = buildService({ defaultLanguage: "ru" });
    const quote = buildQuote();

    const result = await service.generateAndStore("tenant-1", quote, "user-1");
    const text = await extractText(result.buffer);
    // item-2's name/description are Cyrillic — round-tripping through a
    // real PDF text extractor is the only way to confirm the embedded
    // DejaVu Sans font actually mapped these glyphs correctly, rather than
    // silently falling back to .notdef boxes (which extract as nothing or
    // as substitute characters, not the original text).
    expect(text).toContain("Доставка / Delivery / Dostawa");
    expect(text).toContain("Тестове кириличне поле");
  });

  it("produces exactly as many PDF pages as the footer claims, for a long item list", async () => {
    const { service } = buildService();
    const quote = buildQuote(); // 32 items — long enough to force a page break

    const result = await service.generateAndStore("tenant-1", quote, "user-1");
    const pages = await pageCount(result.buffer);
    const text = await extractText(result.buffer);

    expect(pages).toBeGreaterThan(1);
    // Regression guard: the footer previously injected two extra blank
    // pages per real page (pdfkit auto-paginating when text was written
    // inside the bottom margin band). Every page's footer must claim the
    // same, correct total page count.
    for (let i = 1; i <= pages; i += 1) {
      expect(text).toContain(`Page ${i} of ${pages}`);
    }
  });

  it("never clips or truncates long customerNotes/termsAndConditions text", async () => {
    const { service } = buildService();
    const longNotes =
      "Please deliver before 9am and call ahead 30 minutes prior to arrival so someone is available to receive the equipment on site.";
    const longTerms =
      "Standard rental terms apply. Late returns incur a 10% daily surcharge. Damage waiver does not cover intentional misuse. Full terms are available on request from our office.";
    const quote = buildQuote({ customerNotes: longNotes, termsAndConditions: longTerms });

    const result = await service.generateAndStore("tenant-1", quote, "user-1");
    // Long lines legitimately wrap across multiple visual lines within the
    // PDF (expected), which the text extractor reports as embedded line
    // breaks — normalize whitespace before comparing so the assertion
    // checks for missing/truncated *words*, not exact line breaks.
    const normalized = (await extractText(result.buffer)).replace(/\s+/g, " ");

    // Regression guard: doc.x was previously left at the totals table's
    // last column x-position, so this text silently inherited a huge
    // left offset and wrapped/clipped after only a few words.
    expect(normalized).toContain(longNotes);
    expect(normalized).toContain(longTerms);
  });

  it("handles a quote with no notes/terms/discount/tax/deposit (all-optional-fields-empty) without throwing", async () => {
    const { service } = buildService();
    const quote = buildQuote({
      customerNotes: null,
      termsAndConditions: null,
      discountTotalMinor: 0,
      taxTotalMinor: 0,
      depositTotalMinor: 0,
      items: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await service.generateAndStore("tenant-1", quote, null);
    expect(result.buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("includes every required section: header, customer, items, totals, and acceptance", async () => {
    const { service } = buildService();
    const quote = buildQuote();

    const result = await service.generateAndStore("tenant-1", quote, "user-1");
    const text = await extractText(result.buffer);

    expect(text).toContain(quote.quoteNumber);
    expect(text).toContain("Commercial Quote");
    expect(text).toContain("Jane");
    expect(text).toContain("Doe");
    expect(text).toContain("Subtotal");
    expect(text).toContain("Total");
    expect(text).toContain("Quote acceptance");
    expect(text).toContain("not a qualified electronic signature");
    expect(text).toMatch(/Generated:/);
  });

  it("prints issueDate/validUntil/plannedStart/plannedEnd as the literal entered digits, not shifted by the tenant's timezone (D-066)", async () => {
    // issueDate/validUntil/plannedStart/plannedEnd are Prisma DateTime
    // columns mapped to Postgres "timestamp without time zone" — a
    // floating wall-clock value with no real-world instant attached (the
    // digits typed into the picker pass straight through unchanged, since
    // the API server runs with TZ=UTC). A tenant on a non-UTC IANA zone
    // (here America/New_York, EDT = UTC-4) previously caused these four
    // fields to be double-shifted: `new Date("2026-08-10T00:00:00Z")`
    // formatted with `timeZone: "America/New_York"` renders as "08/09"
    // (the previous day) instead of the literal "08/10" that was actually
    // stored and intended.
    const { service } = buildService({ timezone: "America/New_York" });
    const quote = buildQuote({
      issueDate: new Date("2026-08-01T00:00:00Z"),
      validUntil: new Date("2026-09-01T00:00:00Z"),
      plannedStart: new Date("2026-08-10T00:00:00Z"),
      plannedEnd: new Date("2026-08-17T00:00:00Z"),
    });

    const result = await service.generateAndStore("tenant-1", quote, "user-1");
    const text = await extractText(result.buffer);

    expect(text).toContain("08/01/2026");
    expect(text).toContain("09/01/2026");
    expect(text).toContain("08/10/2026");
    expect(text).toContain("08/17/2026");
    expect(text).not.toContain("07/31/2026");
    expect(text).not.toContain("08/31/2026");
    expect(text).not.toContain("08/09/2026");
    expect(text).not.toContain("08/16/2026");
  });
});

describe("QuotePdfService.getLatestDocument", () => {
  it("returns null when no document has been generated yet", async () => {
    const { service } = buildService();
    const result = await service.getLatestDocument("tenant-1", "quote-1");
    expect(result).toBeNull();
  });

  it("reads the most recent document's buffer via StorageService", async () => {
    const { service, prisma, storageService } = buildService();
    prisma.quoteDocument.findFirst.mockResolvedValue({
      id: "doc-1",
      storageKey: "tenants/tenant-1/quotes/quote-1/pdf/abc-Q.pdf",
      originalFileName: "Q-2026-000001.pdf",
      mimeType: "application/pdf",
    });
    storageService.read.mockResolvedValue(Buffer.from("%PDF-fake"));

    const result = await service.getLatestDocument("tenant-1", "quote-1");
    expect(result?.buffer.toString()).toBe("%PDF-fake");
    expect(storageService.read).toHaveBeenCalledWith(
      "tenants/tenant-1/quotes/quote-1/pdf/abc-Q.pdf",
    );
  });
});
