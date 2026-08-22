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
    <span>{{company.name}} · Generated with Havelio</span>
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

const notesSection = `
  <div class="doc-section">
    <div class="doc-section__title">Notes</div>
    <p class="doc-notes">{{notes}}</p>
  </div>`;

/**
 * Generic, tenant-editable clause text, not jurisdiction-specific legal
 * advice — see PRODUCT_BIBLE §28's existing scope boundary (Havelio ships
 * a customizable business document, never a guaranteed-compliant legal
 * contract). Every tenant can edit this content freely once the no-code
 * builder (Part E) ships; this is the starting point, not a final text.
 */
function contractClauseSection(title: string, html: string): string {
  return `
  <div class="doc-section">
    <div class="doc-section__title">${title}</div>
    ${html}
  </div>`;
}

/** The 18-section professional Rental Contract body — see docs/UI_REDESIGN_PLAN.md Pre-Chapter 10 section. */
const rentalContractBody = `${partiesSection}
  <div class="doc-section">
    <div class="doc-section__title">Subject of the Contract — Rented Assets</div>
    {{rental.assetsTableHtml}}
    {{quote.servicesTableHtml}}
  </div>
  <div class="doc-section">
    <div class="doc-section__title">Rental Period</div>
    <div class="doc-card">
      <div class="doc-grid">
        <div class="doc-field"><div class="doc-field__label">Start</div><div class="doc-field__value">{{rental.startDateTime}}</div></div>
        <div class="doc-field"><div class="doc-field__label">End</div><div class="doc-field__value">{{rental.endDateTime}}</div></div>
      </div>
    </div>
  </div>
  <div class="doc-section">
    <div class="doc-section__title">Price</div>
    <div class="doc-card">
      <div class="doc-grid">
        <div class="doc-field"><div class="doc-field__label">Rental total</div><div class="doc-field__value">{{rental.total}}</div></div>
        <div class="doc-field"><div class="doc-field__label">Security deposit</div><div class="doc-field__value">{{rental.deposit}}</div></div>
      </div>
    </div>
  </div>
  ${contractClauseSection(
    "Payment Terms",
    `<p class="doc-clause">The Customer agrees to pay the Rental total of {{rental.total}} according to the payment schedule agreed with {{company.name}}. Any security deposit stated above is held for the duration of the rental and is refundable subject to the return conditions described below.</p>`,
  )}
  ${contractClauseSection(
    "Delivery and Handover",
    `<p class="doc-clause">The rented assets are handed over to the Customer at the start of the Rental Period in the condition recorded in the accompanying Handover Protocol, if one is issued. The Customer is responsible for inspecting the assets at handover and reporting any pre-existing damage immediately.</p>`,
  )}
  ${contractClauseSection(
    "Return",
    `<p class="doc-clause">The Customer must return the rented assets to {{company.name}} by the End of the Rental Period stated above, in the same condition as received, ordinary wear and tear excepted. Condition at return is recorded in the accompanying Return Protocol, if one is issued.</p>`,
  )}
  ${contractClauseSection(
    "Customer Responsibilities",
    `<p class="doc-clause">The Customer shall use the rented assets only for their intended purpose, in accordance with any operating instructions provided, and shall not sublet, lend, or transfer the assets to any third party without {{company.name}}'s prior written consent.</p>`,
  )}
  ${contractClauseSection(
    "Damage and Loss",
    `<p class="doc-clause">The Customer is responsible for any damage to or loss of the rented assets occurring during the Rental Period, beyond ordinary wear and tear, and agrees to reimburse {{company.name}} for repair or replacement costs as documented in a Damage Report.</p>`,
  )}
  ${contractClauseSection(
    "Late Return",
    `<p class="doc-clause">If the rented assets are not returned by the End of the Rental Period, {{company.name}} may charge an additional fee for each day of late return, and reserves the right to recover the assets at the Customer's expense.</p>`,
  )}
  ${contractClauseSection(
    "Non-Payment",
    `<p class="doc-clause">If any amount due under this Contract is not paid when due, {{company.name}} reserves the right to suspend the rental, withhold the security deposit, and pursue collection of the outstanding balance.</p>`,
  )}
  ${contractClauseSection(
    "Termination",
    `<p class="doc-clause">Either party may terminate this Contract early by written notice in the event the other party materially breaches its obligations under this Contract and fails to remedy that breach within a reasonable period after notice.</p>`,
  )}
  ${contractClauseSection(
    "Additional Costs",
    `<p class="doc-clause">Costs not included in the Rental total above — such as delivery, collection, fuel, cleaning, or consumables — are the Customer's responsibility and will be invoiced separately unless otherwise agreed in writing.</p>`,
  )}
  ${contractClauseSection(
    "Notices",
    `<p class="doc-clause">Any notice under this Contract shall be sent to {{company.name}} at {{company.address}} or to the Customer at the address stated above.</p>`,
  )}
  ${contractClauseSection(
    "Applicable Terms and Jurisdiction",
    `<p class="doc-clause">This Contract is governed by the terms agreed between the parties. Any dispute arising from this Contract shall be resolved in accordance with the jurisdiction applicable to {{company.name}}, as customized by {{company.name}} for this template.</p>`,
  )}
  ${contractClauseSection(
    "Additional Conditions",
    `<p class="doc-clause">Any additional conditions specific to this rental can be added here.</p>
    <p class="doc-notes">{{notes}}</p>`,
  )}`;

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
    htmlContent: documentShell("Rental Contract", "{{rental.number}}", rentalContractBody),
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
