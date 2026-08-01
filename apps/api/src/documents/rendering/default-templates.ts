import type { DocumentType } from "@prisma/client";

/**
 * Built-in fallback templates (Part 9's "design system" deliverable) — used
 * by DocumentRendererService whenever a Document has no explicit
 * `templateId` and the tenant has no ACTIVE DocumentTemplate for that type
 * yet, so every document type is renderable out of the box without
 * per-tenant setup. These are plain constants, not database rows: a tenant
 * that wants to customize appearance creates a real DocumentTemplate (see
 * DocumentTemplatesService) and activates it, which then takes precedence.
 *
 * Every template below uses only the shared base stylesheet's class names
 * (see base-document.css) and the variable placeholders documented in ADR
 * 0011 — no document-type-specific columns or logic anywhere else in the
 * codebase depends on this content.
 */
export interface DefaultTemplate {
  title: string;
  htmlContent: string;
}

function documentShell(titleLine: string, subtitleLine: string, body: string): string {
  return `
<div class="doc-page">
  <div class="doc-header">
    <div class="doc-header__brand">
      <img class="doc-header__logo" src="{{company.logo}}" alt="{{company.name}}" />
      <div class="doc-header__company">{{company.name}}</div>
    </div>
    <div class="doc-header__meta">
      {{document.number}}<br />
      {{today}}
    </div>
  </div>

  <h1 class="doc-title">${titleLine}</h1>
  <p class="doc-subtitle">${subtitleLine}</p>

  ${body}

  <div class="doc-signature-row">
    <div class="doc-signature-block">
      <div class="doc-signature-block__label">Company</div>
      <div class="doc-signature-block__name">{{signature.company}}</div>
    </div>
    <div class="doc-signature-block">
      <div class="doc-signature-block__label">Customer</div>
      <div class="doc-signature-block__name">{{customer.name}}</div>
    </div>
  </div>

  <div class="doc-footer">
    <span>{{company.name}}</span>
    <span>{{document.number}} · {{today}}</span>
  </div>
</div>`.trim();
}

const partiesSection = `
  <div class="doc-section">
    <div class="doc-section__title">Parties</div>
    <div class="doc-grid">
      <div>
        <div class="doc-field"><div class="doc-field__label">Company</div><div class="doc-field__value">{{company.name}}</div></div>
        <div class="doc-field"><div class="doc-field__label">Represented by</div><div class="doc-field__value">{{employee.name}}</div></div>
      </div>
      <div>
        <div class="doc-field"><div class="doc-field__label">Customer</div><div class="doc-field__value">{{customer.name}}</div></div>
        <div class="doc-field"><div class="doc-field__label">Address</div><div class="doc-field__value">{{customer.address}}</div></div>
        <div class="doc-field"><div class="doc-field__label">Contact</div><div class="doc-field__value">{{customer.email}} · {{customer.phone}}</div></div>
      </div>
    </div>
  </div>`;

const assetSection = `
  <div class="doc-section">
    <div class="doc-section__title">Asset</div>
    <table class="doc-table">
      <thead><tr><th>Name</th><th>Serial</th><th>Category</th><th>Location</th></tr></thead>
      <tbody><tr><td>{{asset.name}}</td><td>{{asset.serial}}</td><td>{{asset.category}}</td><td>{{asset.location}}</td></tr></tbody>
    </table>
  </div>`;

const rentalSummarySection = `
  <div class="doc-section">
    <div class="doc-section__title">Rental</div>
    <div class="doc-card">
      <div class="doc-grid">
        <div class="doc-field"><div class="doc-field__label">Rental number</div><div class="doc-field__value">{{rental.number}}</div></div>
        <div class="doc-field"><div class="doc-field__label">Total</div><div class="doc-field__value">{{rental.total}}</div></div>
        <div class="doc-field"><div class="doc-field__label">Start</div><div class="doc-field__value">{{rental.start}}</div></div>
        <div class="doc-field"><div class="doc-field__label">End</div><div class="doc-field__value">{{rental.end}}</div></div>
      </div>
    </div>
  </div>`;

const notesSection = `
  <div class="doc-section">
    <div class="doc-section__title">Notes</div>
    <p class="doc-notes">{{notes}}</p>
  </div>`;

export const DEFAULT_TEMPLATES: Record<DocumentType, DefaultTemplate> = {
  QUOTE: {
    title: "Commercial Offer",
    htmlContent: documentShell(
      "Commercial Offer",
      "{{quote.number}}",
      `${partiesSection}
  <div class="doc-section">
    <div class="doc-section__title">Offer</div>
    <div class="doc-card">
      <div class="doc-field"><div class="doc-field__label">Total</div><div class="doc-field__value">{{quote.total}}</div></div>
    </div>
  </div>
  ${notesSection}`,
    ),
  },
  CONTRACT: {
    title: "Rental Contract",
    htmlContent: documentShell(
      "Rental Contract",
      "{{rental.number}}",
      `${partiesSection}${assetSection}${rentalSummarySection}${notesSection}`,
    ),
  },
  HANDOVER_PROTOCOL: {
    title: "Handover Protocol",
    htmlContent: documentShell(
      "Handover Protocol",
      "Condition recorded at handover",
      `${partiesSection}${assetSection}${notesSection}`,
    ),
  },
  RETURN_PROTOCOL: {
    title: "Return Protocol",
    htmlContent: documentShell(
      "Return Protocol",
      "Condition recorded at return",
      `${partiesSection}${assetSection}${notesSection}`,
    ),
  },
  DAMAGE_REPORT: {
    title: "Damage Report",
    htmlContent: documentShell(
      "Damage Report",
      "{{asset.name}} — {{today}}",
      `${assetSection}
  <div class="doc-section">
    <div class="doc-section__title">Damage description</div>
    <p class="doc-notes">{{notes}}</p>
  </div>`,
    ),
  },
  CONTRACT_AMENDMENT: {
    title: "Contract Amendment",
    htmlContent: documentShell(
      "Contract Amendment",
      "Amendment to {{rental.number}}",
      `${partiesSection}${notesSection}`,
    ),
  },
  CUSTOM: {
    title: "Document",
    htmlContent: documentShell("{{document.title}}", "{{document.number}}", `${notesSection}`),
  },
};
