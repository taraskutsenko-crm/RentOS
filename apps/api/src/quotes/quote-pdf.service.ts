import { randomUUID } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import type { QuoteDocument } from "@prisma/client";
import PDFDocument from "pdfkit";

import { resolveDefaultDocumentLanguage } from "../documents/rendering/document-language-resolver.util";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { pdfLabel } from "./pdf-labels.util";
import type { QuoteDetailView, QuoteItemWithAsset } from "./quote.types";

const FONT_REGULAR = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf");
const FONT_BOLD = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf");

const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 495; // A4 (595.28pt) minus 2 * 50pt margins

interface TableColumn {
  key: "name" | "quantity" | "unitPrice" | "discount" | "tax" | "lineTotal";
  width: number;
  label: string;
  align: "left" | "right";
}

export interface GeneratedQuotePdf {
  document: QuoteDocument;
  buffer: Buffer;
}

/**
 * Renders and stores a Quote's commercial-offer PDF. Uses pdfkit (pure JS,
 * no headless-browser dependency — safe in Docker/CI, see ADR 0007) with an
 * embedded DejaVu Sans font (via the dejavu-fonts-ttf package) so Cyrillic
 * (ru/uk) and Latin-Extended (de/pl) text renders correctly — pdfkit's
 * built-in Helvetica/Times/Courier fonts only cover Latin-1. The binary is
 * stored through StorageService (never in Postgres, see ADR 0005); a
 * QuoteDocument row is created per generation, so GET .../pdf always serves
 * the most recently generated one without regenerating on every request.
 */
@Injectable()
export class QuotePdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async generateAndStore(
    tenantId: string,
    quote: QuoteDetailView,
    generatedByUserId: string | null,
  ): Promise<GeneratedQuotePdf> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        countryCode: true,
        defaultLanguage: true,
        timezone: true,
        logoStorageKey: true,
        logoMimeType: true,
      },
    });
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    // The document language (company country first, never the tenant's
    // registration-time UI default alone) — same canonical resolver every
    // other document type uses, so a Polish company gets a Polish
    // Commercial Offer PDF regardless of what language its account
    // happened to be created under (see DECISIONS.md, Commercial Quote PDF
    // localization fix).
    const language = resolveDefaultDocumentLanguage(tenant);
    const logo = await this.loadLogo(tenant);

    const buffer = await this.renderPdf(quote, tenant.name, language, tenant.timezone, logo);
    const fileName = `${quote.quoteNumber}.pdf`;
    const storageKey = this.buildKey(tenantId, quote.id, fileName);

    await this.storageService.store(storageKey, {
      buffer,
      mimetype: "application/pdf",
      originalname: fileName,
      size: buffer.length,
    });

    const document = await this.prisma.quoteDocument.create({
      data: {
        tenantId,
        quoteId: quote.id,
        storageKey,
        originalFileName: fileName,
        mimeType: "application/pdf",
        sizeBytes: buffer.length,
        generatedByUserId,
      },
    });

    return { document, buffer };
  }

  async getLatestDocument(tenantId: string, quoteId: string): Promise<GeneratedQuotePdf | null> {
    const document = await this.prisma.quoteDocument.findFirst({
      where: { tenantId, quoteId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!document) {
      return null;
    }
    const buffer = await this.storageService.read(document.storageKey);
    return { document, buffer };
  }

  private buildKey(tenantId: string, quoteId: string, fileName: string): string {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
    return `tenants/${tenantId}/quotes/${quoteId}/pdf/${randomUUID()}-${safeName}`;
  }

  /**
   * Reads the tenant's stored logo — the same canonical, normalized PNG
   * rendition every other document renderer consumes (see
   * CompanyLogoService.normalize() and docs/DECISIONS.md D-119), which is
   * what makes a WebP-*sourced* logo render correctly here too: pdfkit's
   * `doc.image()` only decodes JPEG/PNG, never WebP, but by the time a
   * logo reaches storage it has already been normalized to PNG regardless
   * of what format the tenant originally uploaded — there is no
   * WebP-specific handling needed in this file. The `logoMimeType` guard
   * below is defense-in-depth only, for a logo stored before this
   * normalization pipeline existed (pre-D-119 uploads keep their original,
   * un-normalized mime type until the tenant re-uploads/replaces). Resilient
   * to a storage read failure — degrades to "no logo" rather than failing
   * PDF generation.
   */
  private async loadLogo(tenant: {
    logoStorageKey: string | null;
    logoMimeType: string | null;
  }): Promise<Buffer | null> {
    if (!tenant.logoStorageKey || !tenant.logoMimeType) return null;
    if (tenant.logoMimeType !== "image/png" && tenant.logoMimeType !== "image/jpeg") return null;
    try {
      return await this.storageService.read(tenant.logoStorageKey);
    } catch {
      return null;
    }
  }

  private renderPdf(
    quote: QuoteDetailView,
    tenantName: string,
    language: string,
    timezone: string,
    logo: Buffer | null,
  ): Promise<Buffer> {
    const t = (path: string, fallback: string) => pdfLabel(language, path, fallback);
    const money = (minor: number) => formatMoney(minor, quote.currency, language);
    // quote.issueDate/validUntil/plannedStart/plannedEnd are real UTC
    // instants (see docs/DECISIONS.md D-115, superseding D-066's "floating
    // naive" model) — format with the tenant's real IANA zone like every
    // other genuine instant in this document.
    const date = (value: Date) => formatDate(value, language, timezone);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (error: Error) => reject(error));

      try {
        doc.registerFont("body", FONT_REGULAR);
        doc.registerFont("bold", FONT_BOLD);
        doc.font("body");

        this.drawHeader(doc, quote, tenantName, t, logo);
        this.drawCustomerAndMeta(doc, quote, t, date);
        this.drawItemsTable(doc, quote.items, t, money);
        this.drawTotals(doc, quote, t, money);
        this.drawNotesAndTerms(doc, quote, t);
        this.drawAcceptanceSection(doc, quote, t, date);
        this.drawFooter(doc, t, date);

        doc.end();
      } catch (error) {
        reject(error as Error);
      }
    });
  }

  private drawHeader(
    doc: PDFKit.PDFDocument,
    quote: QuoteDetailView,
    tenantName: string,
    t: (path: string, fallback: string) => string,
    logo: Buffer | null,
  ): void {
    // Havelio Company Branding (docs/PRODUCT_BIBLE.md) — placed in the
    // top-right corner at a fixed position so it never disturbs the
    // existing left-aligned flowing text below (company name/title/quote
    // number/status), which reads `doc.y` sequentially. `fit` preserves
    // aspect ratio and never stretches; the box is a hard cap, never
    // pixelated/overflowing regardless of the source image's own size.
    if (logo) {
      const boxWidth = 130;
      const boxHeight = 50;
      doc.image(logo, PAGE_MARGIN + CONTENT_WIDTH - boxWidth, PAGE_MARGIN, {
        fit: [boxWidth, boxHeight],
        align: "right",
      });
    }

    doc.font("bold").fontSize(18).text(tenantName);
    doc.font("bold").fontSize(13).text(t("quote.pdf.title", "Commercial Quote"));
    doc.font("body").fontSize(10);
    doc.moveDown(0.3);
    doc.text(`${t("quote.pdf.quoteNumber", "Quote number")}: ${quote.quoteNumber}`);
    doc.text(`${t("quote.pdf.status", "Status")}: ${quote.status}`);
    doc.moveDown(0.8);
    this.drawDivider(doc);
    doc.moveDown(0.5);
  }

  private drawCustomerAndMeta(
    doc: PDFKit.PDFDocument,
    quote: QuoteDetailView,
    t: (path: string, fallback: string) => string,
    date: (value: Date) => string,
  ): void {
    doc.font("bold").fontSize(11).text(t("quote.pdf.customer", "Customer"));
    doc.font("body").fontSize(10);
    doc.text(`${quote.customer.firstName} ${quote.customer.lastName}`);
    if (quote.customer.company) doc.text(quote.customer.company);
    if (quote.customer.email) doc.text(quote.customer.email);
    if (quote.customer.phone) doc.text(quote.customer.phone);

    doc.moveDown(0.6);
    doc.text(`${t("quote.pdf.issueDate", "Issue date")}: ${date(quote.issueDate)}`);
    doc.text(`${t("quote.pdf.validUntil", "Valid until")}: ${date(quote.validUntil)}`);
    doc.text(
      `${t("quote.pdf.plannedPeriod", "Planned rental period")}: ${date(quote.plannedStart)} - ${date(quote.plannedEnd)}`,
    );
    doc.moveDown(0.8);
    this.drawDivider(doc);
    doc.moveDown(0.5);
  }

  private drawDivider(doc: PDFKit.PDFDocument): void {
    const y = doc.y;
    doc
      .moveTo(PAGE_MARGIN, y)
      .lineTo(PAGE_MARGIN + CONTENT_WIDTH, y)
      .strokeColor("#cccccc")
      .stroke();
  }

  private buildColumns(t: (path: string, fallback: string) => string): TableColumn[] {
    return [
      { key: "name", width: 195, label: t("quote.pdf.columns.name", "Description"), align: "left" },
      { key: "quantity", width: 35, label: t("quote.pdf.columns.quantity", "Qty"), align: "right" },
      {
        key: "unitPrice",
        width: 90,
        label: t("quote.pdf.columns.unitPrice", "Unit price"),
        align: "right",
      },
      {
        key: "discount",
        width: 65,
        label: t("quote.pdf.columns.discount", "Discount"),
        align: "right",
      },
      { key: "tax", width: 45, label: t("quote.pdf.columns.tax", "Tax"), align: "right" },
      {
        key: "lineTotal",
        width: 65,
        label: t("quote.pdf.columns.lineTotal", "Line total"),
        align: "right",
      },
    ];
  }

  private drawItemsTable(
    doc: PDFKit.PDFDocument,
    items: QuoteItemWithAsset[],
    t: (path: string, fallback: string) => string,
    money: (minor: number) => string,
  ): void {
    const columns = this.buildColumns(t);
    this.drawTableHeader(doc, columns);

    for (const item of items) {
      const cellTexts = this.buildRowCellTexts(item, columns, money);
      const rowHeight = this.measureRowHeight(doc, columns, cellTexts);

      if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom - 40) {
        doc.addPage();
        this.drawTableHeader(doc, columns);
      }

      let x = PAGE_MARGIN;
      const rowTop = doc.y;
      for (let i = 0; i < columns.length; i += 1) {
        const column = columns[i]!;
        doc
          .font("body")
          .fontSize(9)
          .text(cellTexts[i]!, x, rowTop, { width: column.width, align: column.align });
        x += column.width;
      }
      doc.y = rowTop + rowHeight;
      doc
        .moveTo(PAGE_MARGIN, doc.y + 2)
        .lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y + 2)
        .strokeColor("#eeeeee")
        .stroke();
      doc.y += 6;
    }

    doc.moveDown(0.5);
  }

  private drawTableHeader(doc: PDFKit.PDFDocument, columns: TableColumn[]): void {
    let x = PAGE_MARGIN;
    const y = doc.y;
    doc.font("bold").fontSize(9);
    for (const column of columns) {
      doc.text(column.label, x, y, { width: column.width, align: column.align });
      x += column.width;
    }
    doc.y = y + 14;
    this.drawDivider(doc);
    doc.y += 4;
  }

  private buildRowCellTexts(
    item: QuoteItemWithAsset,
    columns: TableColumn[],
    money: (minor: number) => string,
  ): string[] {
    const nameLines = [item.name, item.description].filter(Boolean).join("\n");
    const unitPrice = describeUnitPrice(item, money);
    const discount = item.discountTotalMinor > 0 ? `-${money(item.discountTotalMinor)}` : "—";
    const tax = item.taxTotalMinor > 0 ? money(item.taxTotalMinor) : "—";
    const lineTotal = money(item.lineTotalMinor);

    return columns.map((column) => {
      switch (column.key) {
        case "name":
          return nameLines;
        case "quantity":
          return String(item.quantity);
        case "unitPrice":
          return unitPrice;
        case "discount":
          return discount;
        case "tax":
          return tax;
        case "lineTotal":
          return lineTotal;
      }
    });
  }

  private measureRowHeight(
    doc: PDFKit.PDFDocument,
    columns: TableColumn[],
    cellTexts: string[],
  ): number {
    doc.font("body").fontSize(9);
    const heights = columns.map((column, index) =>
      doc.heightOfString(cellTexts[index]!, { width: column.width }),
    );
    return Math.max(...heights, 12);
  }

  private drawTotals(
    doc: PDFKit.PDFDocument,
    quote: QuoteDetailView,
    t: (path: string, fallback: string) => string,
    money: (minor: number) => string,
  ): void {
    const rows: [string, string][] = [
      [t("quote.pdf.subtotal", "Subtotal"), money(quote.subtotalMinor)],
      ...(quote.discountTotalMinor > 0
        ? ([[t("quote.pdf.discountTotal", "Discount"), `-${money(quote.discountTotalMinor)}`]] as [
            string,
            string,
          ][])
        : []),
      ...(quote.taxTotalMinor > 0
        ? ([[t("quote.pdf.taxTotal", "Tax (included)"), money(quote.taxTotalMinor)]] as [
            string,
            string,
          ][])
        : []),
      ...(quote.depositTotalMinor > 0
        ? ([[t("quote.pdf.depositTotal", "Deposit required"), money(quote.depositTotalMinor)]] as [
            string,
            string,
          ][])
        : []),
      [t("quote.pdf.total", "Total"), money(quote.totalMinor)],
      // Explicit "amount due at start" -- kept visually distinct from Total,
      // which stays the taxable value only; a refundable deposit is never
      // revenue (see DECISIONS.md D-097/D-098).
      ...(quote.depositTotalMinor > 0
        ? ([
            [
              t("quote.pdf.amountDue", "Amount due at start"),
              money(quote.totalMinor + quote.depositTotalMinor),
            ],
          ] as [string, string][])
        : []),
    ];

    const labelWidth = 350;
    const valueWidth = CONTENT_WIDTH - labelWidth;
    for (const [label, value] of rows) {
      const isTotal = label === rows[rows.length - 1]![0];
      doc.font(isTotal ? "bold" : "body").fontSize(isTotal ? 11 : 10);
      const y = doc.y;
      doc.text(label, PAGE_MARGIN, y, { width: labelWidth, align: "right" });
      doc.text(value, PAGE_MARGIN + labelWidth, y, { width: valueWidth, align: "right" });
      doc.moveDown(0.4);
    }
    // Explicit x positioning above (for the two-column label/value layout)
    // leaves doc.x sitting wherever the last .text() call ended, not back
    // at the page margin — any following .text() call that omits an
    // explicit x would silently inherit that offset as its own left edge,
    // shrinking its effective wrap width and clipping content. Every
    // section below relies on the default margin, so reset explicitly.
    doc.x = PAGE_MARGIN;
    doc.moveDown(0.6);
  }

  private drawNotesAndTerms(
    doc: PDFKit.PDFDocument,
    quote: QuoteDetailView,
    t: (path: string, fallback: string) => string,
  ): void {
    if (quote.customerNotes) {
      doc.font("bold").fontSize(10).text(t("quote.pdf.customerNotes", "Notes"));
      doc.font("body").fontSize(9).text(quote.customerNotes, { width: CONTENT_WIDTH });
      doc.moveDown(0.6);
    }
    if (quote.termsAndConditions) {
      doc.font("bold").fontSize(10).text(t("quote.pdf.termsAndConditions", "Terms and conditions"));
      doc.font("body").fontSize(9).text(quote.termsAndConditions, { width: CONTENT_WIDTH });
      doc.moveDown(0.6);
    }
  }

  private drawAcceptanceSection(
    doc: PDFKit.PDFDocument,
    quote: QuoteDetailView,
    t: (path: string, fallback: string) => string,
    date: (value: Date) => string,
  ): void {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 120) {
      doc.addPage();
    }
    doc.moveDown(0.4);
    this.drawDivider(doc);
    doc.moveDown(0.4);
    doc.font("bold").fontSize(10).text(t("quote.pdf.acceptanceTitle", "Quote acceptance"));
    doc
      .font("body")
      .fontSize(8)
      .fillColor("#666666")
      .text(
        t(
          "quote.pdf.acceptanceDisclaimer",
          "This section records quote acceptance only. It is not a qualified electronic signature.",
        ),
        { width: CONTENT_WIDTH },
      );
    doc.fillColor("#000000");
    doc.moveDown(0.6);

    if (quote.acceptedAt) {
      doc
        .fontSize(9)
        .text(`${t("quote.pdf.acceptedBy", "Accepted by")}: ${quote.acceptedBy ?? "—"}`);
      doc.text(`${t("quote.pdf.acceptedAt", "Accepted at")}: ${date(quote.acceptedAt)}`);
    } else {
      doc.fontSize(9).text(`${t("quote.pdf.acceptedBy", "Accepted by")}: ____________________`);
      doc.text(`${t("quote.pdf.acceptedAt", "Accepted at")}: ____________________`);
    }
  }

  private drawFooter(
    doc: PDFKit.PDFDocument,
    t: (path: string, fallback: string) => string,
    date: (value: Date) => string,
  ): void {
    const range = doc.bufferedPageRange();
    const generatedAt = `${t("quote.pdf.generatedAt", "Generated")}: ${date(new Date())}`;
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const pageLabel = `${t("quote.pdf.page", "Page")} ${i + 1} ${t("quote.pdf.of", "of")} ${range.count}`;

      // The footer sits inside the bottom margin band by design. Writing
      // there via the normal .text() flow would make pdfkit think the
      // content overflowed the page and silently insert a *new* blank page
      // per call (two calls here -> two extra blank pages per real page).
      // Zeroing the bottom margin for these two calls disables that
      // automatic-pagination check without affecting any other content.
      const originalBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .font("body")
        .fontSize(8)
        .fillColor("#888888")
        .text(generatedAt, PAGE_MARGIN, doc.page.height - 35, {
          width: CONTENT_WIDTH / 2,
          align: "left",
          lineBreak: false,
        });
      doc.text(pageLabel, PAGE_MARGIN + CONTENT_WIDTH / 2, doc.page.height - 35, {
        width: CONTENT_WIDTH / 2,
        align: "right",
        lineBreak: false,
      });
      doc.fillColor("#000000");
      doc.page.margins.bottom = originalBottomMargin;
    }
  }
}

function describeUnitPrice(item: QuoteItemWithAsset, money: (minor: number) => string): string {
  switch (item.billingMode) {
    case "DAILY":
      return `${money(item.dailyPriceMinor ?? 0)}/d`;
    case "WEEKLY":
      return `${money(item.weeklyPriceMinor ?? 0)}/wk`;
    case "MONTHLY":
      return `${money(item.monthlyPriceMinor ?? 0)}/mo`;
    case "CUSTOM":
      return money(item.customPriceMinor ?? 0);
    case "FLAT":
      return money(item.unitPriceMinor ?? 0);
  }
}

/**
 * `timezone` is the tenant's own IANA zone (`Tenant.timezone`, set at
 * registration) rather than hardcoded UTC — a quote PDF is a business
 * document dated from the issuing tenant's perspective, not the server's.
 */
function formatDate(value: Date, language: string, timezone: string): string {
  return new Intl.DateTimeFormat(language, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).format(value);
}

function formatMoney(minor: number, currency: string, language: string): string {
  return new Intl.NumberFormat(language, { style: "currency", currency }).format(minor / 100);
}
