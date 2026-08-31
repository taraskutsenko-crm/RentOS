/**
 * Shared base stylesheet for every rendered document (TASK-0008 Part 2,
 * "Part 9 — Design system"). Minimal, modern, enterprise: white
 * background, dark typography, generous spacing, restrained color use —
 * aiming for the same register as Stripe/Notion/Linear's own documentation
 * and generated PDFs, not a dense "form letter" look.
 *
 * Every built-in default template (see default-templates.ts) uses this
 * unmodified; a DocumentTemplateVersion.css value is layered *after* this
 * (see DocumentRendererService.renderHtml), so a tenant's custom template
 * can override individual rules without having to redefine the whole
 * sheet.
 *
 * A TypeScript string constant, deliberately not a standalone `.css` file:
 * `tsc`'s build only emits compiled `.ts` -> `.js` into `dist/`, so a
 * sibling `.css` asset would silently go missing from the production build
 * unless a separate copy step were added — the same class of bug this
 * codebase already hit once with localization JSON (see
 * packages/localization's build script). Keeping it as an exported string
 * avoids that failure mode entirely, no build-step changes needed.
 */
export const BASE_DOCUMENT_CSS = `
/* True A4 page size and print-safe margins for the browser's native print
   dialog (the "Direct Print" action — printing the preview iframe directly,
   see documents/[id]/page.tsx). Puppeteer's own PDF render
   (pdf-renderer.service.ts) passes an explicit JS-level margin of 0 and
   does not set preferCSSPageSize, so that render path always overrides
   this rule and is completely unaffected by it — this @page rule only
   ever applies to a real browser print. */
@page {
  size: A4;
  margin: 18mm 16mm;
}

:root {
  --doc-ink: #17181c;
  --doc-ink-muted: #5b5f6b;
  --doc-ink-faint: #8b8f99;
  --doc-border: #e6e7eb;
  --doc-accent: #2563eb;
  --doc-bg: #ffffff;
  --doc-bg-subtle: #f7f8fa;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  background: var(--doc-bg);
  color: var(--doc-ink);
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Roboto,
    Helvetica,
    Arial,
    sans-serif;
  font-size: 14px;
  line-height: 1.6;
}

.doc-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 56px 48px 72px;
}

.doc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 24px;
  margin-bottom: 32px;
  border-bottom: 1px solid var(--doc-border);
}

.doc-header__brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.doc-header__logo {
  max-height: 40px;
  max-width: 160px;
  object-fit: contain;
}

.doc-header__company {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.doc-header__meta {
  text-align: right;
  color: var(--doc-ink-muted);
  font-size: 12px;
  line-height: 1.5;
}

.doc-title {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 4px;
}

.doc-subtitle {
  color: var(--doc-ink-muted);
  font-size: 14px;
  margin: 0 0 32px;
}

.doc-section {
  margin-bottom: 28px;
}

.doc-section__title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--doc-ink-faint);
  margin: 0 0 10px;
}

.doc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.doc-field {
  margin-bottom: 6px;
}

.doc-field__label {
  color: var(--doc-ink-faint);
  font-size: 12px;
}

.doc-field__value {
  font-size: 14px;
}

.doc-card {
  background: var(--doc-bg-subtle);
  border: 1px solid var(--doc-border);
  border-radius: 10px;
  padding: 20px 24px;
}

table.doc-table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0 0;
}

table.doc-table th {
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--doc-ink-faint);
  padding: 0 12px 10px 0;
  border-bottom: 1px solid var(--doc-border);
}

table.doc-table td {
  padding: 12px 12px 12px 0;
  border-bottom: 1px solid var(--doc-border);
  vertical-align: top;
}

table.doc-table tr:last-child td {
  border-bottom: none;
}

.doc-table__num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.doc-signature-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  margin-top: 48px;
}

.doc-signature-block {
  border-top: 1px solid var(--doc-ink);
  padding-top: 8px;
}

.doc-signature-block__label {
  font-size: 11px;
  color: var(--doc-ink-faint);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.doc-signature-block__name {
  font-size: 14px;
  margin-top: 4px;
}

.doc-signature-block__title {
  font-size: 12px;
  color: var(--doc-ink-muted);
}

/* Havelio Signature System (docs/PRODUCT_BIBLE.md) — the embedded
   handwritten signature image. Capped size, aspect ratio preserved,
   never stretched — mirrors .doc-header__logo's own object-fit rule. */
.doc-signature-block__image {
  display: block;
  max-height: 64px;
  max-width: 220px;
  object-fit: contain;
  margin: 8px 0;
}

.doc-signature-block__signedat {
  font-size: 11px;
  color: var(--doc-ink-faint);
  margin-top: 4px;
}

.doc-footer {
  margin-top: 56px;
  padding-top: 16px;
  border-top: 1px solid var(--doc-border);
  color: var(--doc-ink-faint);
  font-size: 11px;
  display: flex;
  justify-content: space-between;
}

.doc-notes {
  white-space: pre-wrap;
  color: var(--doc-ink-muted);
}

.doc-clause {
  color: var(--doc-ink-muted);
  margin: 0;
}

/* Keeps a clause/table row/signature block from being split across a PDF
   page boundary (TASK-0008 Part 2 follow-up: the 18-section contract
   template; signature-row addition per DECISIONS.md D-107 multi-page pass). */
.doc-section,
.doc-signature-row,
table.doc-table tr {
  page-break-inside: avoid;
}

/* Never leave a section heading stranded alone at the bottom of a page,
   separated from the content it introduces (D-107). */
.doc-section__title {
  page-break-after: avoid;
}

/* Keeps at least a few lines of a paragraph together on either side of a
   page break instead of stranding a single orphan/widow line (D-107). */
.doc-clause,
.doc-notes {
  orphans: 3;
  widows: 3;
}

/* Puppeteer's PDF render (margin: 0 at the JS level, see the @page comment
   above) relies entirely on .doc-page's own padding for its margin, so
   that padding must stay full-size there. A real browser print instead
   gets its margin from @page above -- stacking .doc-page's padding on top
   of that would double it, so shrink it down to a small visual gutter
   for print only. */
@media print {
  .doc-page {
    max-width: none;
    padding: 8px 0 24px;
  }
}
`;
