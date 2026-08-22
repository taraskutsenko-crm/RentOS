import { Injectable } from "@nestjs/common";

import { PdfRendererService } from "../../documents/rendering/pdf-renderer.service";
import type { InvoiceDetailView } from "../invoice.types";
import { InvoiceRendererService } from "./invoice-renderer.service";

/**
 * Renders an Invoice to PDF bytes on demand — always regenerated from the
 * invoice's own stored data (frozen snapshots + line items once ISSUED),
 * never cached/stored as a file. This is deliberately simpler than
 * Document's DocumentPdfService (no DocumentFile row, no StorageService
 * write): an issued Invoice's snapshot data never changes, so
 * regenerating on every request is always byte-for-byte identical and
 * cheap — there is nothing a cached copy would save beyond one Puppeteer
 * render per download. Reuses PdfRendererService.renderPdf(html) — the
 * exact same Puppeteer engine Document PDFs use — so no second PDF
 * generator is introduced anywhere in the codebase.
 */
@Injectable()
export class InvoicePdfService {
  constructor(
    private readonly invoiceRenderer: InvoiceRendererService,
    private readonly pdfRenderer: PdfRendererService,
  ) {}

  async render(invoice: InvoiceDetailView): Promise<Buffer> {
    const { html } = this.invoiceRenderer.render(invoice);
    return this.pdfRenderer.renderPdf(html);
  }
}
