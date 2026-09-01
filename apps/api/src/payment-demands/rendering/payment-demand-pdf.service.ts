import { Injectable } from "@nestjs/common";

import { PdfRendererService } from "../../documents/rendering/pdf-renderer.service";
import type { PaymentDemandDetailView } from "../payment-demand.types";
import { PaymentDemandRendererService } from "./payment-demand-renderer.service";

/**
 * Renders a Payment Demand to PDF bytes on demand — mirrors
 * InvoicePdfService exactly (see that file's own doc comment): a demand's
 * frozen snapshot data never changes once generated, so regenerating on
 * every request is always byte-for-byte identical and cheap. No
 * DocumentFile row, no StorageService write, no second PDF generator —
 * reuses the same Puppeteer-backed PdfRendererService.renderPdf(html)
 * every other PDF in this codebase uses.
 */
@Injectable()
export class PaymentDemandPdfService {
  constructor(
    private readonly renderer: PaymentDemandRendererService,
    private readonly pdfRenderer: PdfRendererService,
  ) {}

  async render(demand: PaymentDemandDetailView): Promise<Buffer> {
    const { html } = this.renderer.render(demand);
    return this.pdfRenderer.renderPdf(html);
  }
}
