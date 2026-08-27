import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import puppeteer, { type Browser } from "puppeteer";

// Puppeteer replaces `class="title"` with the rendered page's own
// `document.title` (each renderer sets this to the document/invoice
// number — see document-renderer.service.ts's wrapDocumentHtml and
// invoice-renderer.service.ts) and `pageNumber`/`totalPages` with the
// live page count, so this one static template covers every document
// type without per-type wiring (D-107).
const HEADER_TEMPLATE = `<div style="width:100%;font-size:9px;color:#8b8f99;padding:0 16mm;font-family:Arial,Helvetica,sans-serif;">
  <span class="title"></span>
</div>`;

const FOOTER_TEMPLATE = `<div style="width:100%;font-size:9px;color:#8b8f99;padding:0 16mm;text-align:right;font-family:Arial,Helvetica,sans-serif;">
  <span class="pageNumber"></span> / <span class="totalPages"></span>
</div>`;

/**
 * Converts a fully-resolved HTML document (see DocumentRendererService)
 * into a PDF buffer via a headless Chromium instance (Puppeteer) — the
 * genuine "parse arbitrary HTML+CSS and lay it out" capability that
 * `pdfkit` (an imperative drawing API with no HTML/CSS support at all,
 * used by QuotePdfService — see ADR 0007) cannot provide. This is a
 * deliberate, scoped reversal of ADR 0007's "no headless browser" decision
 * for this one new capability only; QuotePdfService itself is untouched.
 * See docs/adr/0011-document-rendering-and-sharing.md for the full
 * rationale and the Docker/Alpine compatibility approach.
 *
 * The browser process is expensive to start (roughly 1 second), so a
 * single instance is lazily launched and reused for the lifetime of the
 * process, not relaunched per render — `onModuleDestroy` closes it
 * cleanly on shutdown.
 */
@Injectable()
export class PdfRendererService implements OnModuleDestroy {
  private browserPromise: Promise<Browser> | null = null;

  async renderPdf(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      // `networkidle0/2` aren't valid here — setContent has no navigation
      // event to correlate against; "load" is correct and sufficient since
      // every render is a self-contained HTML string with inline CSS and no
      // external resources (see resolveVariables' no-raw-HTML-injection note).
      await page.setContent(html, { waitUntil: "load" });
      // Reserves slim top/bottom margins for a repeated running header
      // (the document's own <title> — its number) and a page-number
      // footer on every page of a multi-page render (D-107). Left/right
      // stay 0: unchanged from before, since .doc-page's own CSS padding
      // (see base-document-css.ts) already supplies the horizontal margin.
      const pdf = await page.pdf({
        format: "a4",
        printBackground: true,
        margin: { top: "36px", right: "0", bottom: "32px", left: "0" },
        displayHeaderFooter: true,
        headerTemplate: HEADER_TEMPLATE,
        footerTemplate: FOOTER_TEMPLATE,
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.browserPromise) return;
    const browser = await this.browserPromise;
    await browser.close();
  }

  private getBrowser(): Promise<Browser> {
    this.browserPromise ??= puppeteer.launch({
      headless: true,
      // Docker (Alpine) sets PUPPETEER_EXECUTABLE_PATH to the apk-installed
      // system Chromium and skips Puppeteer's own (glibc-only, non-Alpine-
      // compatible) bundled download entirely — see apps/api/Dockerfile
      // and ADR 0011. Puppeteer reads this env var itself when
      // `executablePath` is omitted; local dev/CI use Puppeteer's own
      // downloaded Chromium unmodified.
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    return this.browserPromise;
  }
}
