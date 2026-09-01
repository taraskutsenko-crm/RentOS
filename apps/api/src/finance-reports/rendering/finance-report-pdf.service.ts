import { Injectable } from "@nestjs/common";

import { PdfRendererService } from "../../documents/rendering/pdf-renderer.service";
import { FinanceReportRendererService, type FinanceReportPdfInput } from "./finance-report-renderer.service";

/**
 * Renders the Financial Report to PDF bytes on demand — reuses the exact
 * same Puppeteer engine every other PDF in this codebase uses
 * (PdfRendererService), never a second PDF generator. Unlike an Invoice
 * (frozen at issue time), a Financial Report is always regenerated fresh
 * from live data on every export — it does not need the immutable-
 * document-lifecycle guarantees Invoice/Document have, since it is an
 * analytical export, not a legal record (see docs/PRODUCT_BIBLE.md §31).
 */
@Injectable()
export class FinanceReportPdfService {
  constructor(
    private readonly renderer: FinanceReportRendererService,
    private readonly pdfRenderer: PdfRendererService,
  ) {}

  async render(input: FinanceReportPdfInput): Promise<Buffer> {
    const html = this.renderer.render(input);
    return this.pdfRenderer.renderPdf(html);
  }
}
