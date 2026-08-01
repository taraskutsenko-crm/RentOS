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
`;
