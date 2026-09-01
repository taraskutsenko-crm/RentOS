import { Injectable } from "@nestjs/common";

import { BASE_DOCUMENT_CSS } from "../../documents/rendering/base-document-css";
import type { PaymentDemandDetailView } from "../payment-demand.types";
import { getPaymentDemandStrings, type PaymentDemandStrings } from "./payment-demand-strings";

export interface RenderedPaymentDemandHtml {
  html: string;
}

/**
 * Renders a Payment Demand's HTML directly from its own frozen data —
 * mirrors invoice-renderer.service.ts's own architecture exactly (see that
 * file's doc comment for the full rationale): its own first-class model,
 * not routed through the generic Document `{{placeholder}}` pipeline,
 * reusing only the shared `BASE_DOCUMENT_CSS` stylesheet and, for actual
 * PDF bytes, `PdfRendererService.renderPdf` (see payment-demand-pdf.service.ts).
 *
 * Country-aware, not merely language-aware: the wording/title come from
 * `getPaymentDemandStrings(demand.countryCode, demand.documentLanguage)` —
 * Poland always renders "WEZWANIE DO ZAPŁATY" in Polish regardless of
 * `documentLanguage`, while every other country gets the safe generic
 * international template in its own document language (see
 * payment-demand-strings.ts's own doc comment and docs/DECISIONS.md).
 *
 * Renders straight from `creditorSnapshot`/`debtorSnapshot`/`bankSnapshot`
 * and the demand's own stored amount/date fields — never from a live
 * Tenant/Customer/CompanyBankAccount/Invoice lookup — so a generated
 * demand's rendered output is byte-for-byte reproducible forever,
 * regardless of any later payment, void, or Company Profile edit.
 */
@Injectable()
export class PaymentDemandRendererService {
  render(demand: PaymentDemandDetailView): RenderedPaymentDemandHtml {
    const strings = getPaymentDemandStrings(demand.countryCode, demand.documentLanguage);
    const creditor = demand.creditorSnapshot as Record<string, string>;
    const debtor = demand.debtorSnapshot as Record<string, string>;
    const bank = demand.bankSnapshot as Record<string, string> | null;

    const money = (minor: number) =>
      formatMoney(minor, demand.currency, demand.documentLanguage);
    const date = (iso: string | null) => (iso ? formatDate(iso, demand.documentLanguage) : "—");

    const html = `
<!doctype html>
<html lang="${escapeHtml(demand.documentLanguage)}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(demand.demandNumber)}</title>
<style>${BASE_DOCUMENT_CSS}</style>
</head>
<body>
<div class="doc-page">
  <div class="doc-header">
    <div class="doc-header__brand">
      ${logoHtml(creditor)}
      <div class="doc-header__company">${escapeHtml(String(creditor.name ?? ""))}</div>
    </div>
    <div class="doc-header__meta">
      ${escapeHtml(demand.demandNumber)}<br />
      ${escapeHtml(date(demand.issueDate))}
    </div>
  </div>

  <h1 class="doc-title">${escapeHtml(strings.title)}</h1>
  <p class="doc-subtitle">${escapeHtml(strings.demandNumberLabel)}: ${escapeHtml(demand.demandNumber)}</p>

  <div class="doc-section doc-grid">
    <div>
      <div class="doc-section__title">${escapeHtml(strings.creditorLabel)}</div>
      ${partyBlock(creditor, strings)}
    </div>
    <div>
      <div class="doc-section__title">${escapeHtml(strings.debtorLabel)}</div>
      ${partyBlock(debtor, strings)}
    </div>
  </div>

  <div class="doc-section">
    <p class="doc-notes">${escapeHtml(strings.introParagraph)}</p>
  </div>

  <div class="doc-section doc-grid">
    <div class="doc-field">
      <div class="doc-field__label">${escapeHtml(strings.issueDateLabel)}</div>
      <div class="doc-field__value">${escapeHtml(date(demand.issueDate))}</div>
    </div>
    <div class="doc-field">
      <div class="doc-field__label">${escapeHtml(strings.invoiceReferenceLabel)}</div>
      <div class="doc-field__value">${escapeHtml(demand.invoice?.invoiceNumber ?? "—")}</div>
    </div>
    <div class="doc-field">
      <div class="doc-field__label">${escapeHtml(strings.originalDueDateLabel)}</div>
      <div class="doc-field__value">${escapeHtml(date(demand.originalDueDate))}</div>
    </div>
    <div class="doc-field">
      <div class="doc-field__label">${escapeHtml(strings.requestedDeadlineLabel)}</div>
      <div class="doc-field__value">${escapeHtml(date(demand.requestedDeadline))}</div>
    </div>
  </div>

  <div class="doc-section" style="display: flex; justify-content: flex-end;">
    <div style="min-width: 280px;">
      ${totalsRow(strings.originalAmountLabel, money(demand.originalAmountMinor))}
      ${demand.paidAmountMinor > 0 ? totalsRow(strings.paidLabel, money(demand.paidAmountMinor)) : ""}
      ${totalsRow(strings.outstandingLabel, money(demand.outstandingAmountMinor), true)}
    </div>
  </div>

  ${bank ? bankSection(bank, strings) : ""}

  <div class="doc-section">
    <p class="doc-notes">${escapeHtml(strings.closingParagraph)}</p>
  </div>

  <div class="doc-footer">
    <span>${escapeHtml(strings.generatedWith)}</span>
  </div>
</div>
</body>
</html>`;

    return { html };
  }
}

/** Same base64-embedded-in-snapshot pattern as invoice-renderer.service.ts's logoHtml — never a live storage read, never a broken image when no logo was captured. */
function logoHtml(creditor: Record<string, string>): string {
  if (!creditor.logoBase64 || !creditor.logoMimeType) return "";
  return `<img class="doc-header__logo" src="data:${creditor.logoMimeType};base64,${creditor.logoBase64}" alt="${escapeHtml(String(creditor.name ?? ""))}" />`;
}

function partyBlock(party: Record<string, string>, strings: PaymentDemandStrings): string {
  const lines: string[] = [];
  if (party.name) lines.push(escapeHtml(party.name));
  if (party.address) lines.push(escapeHtml(party.address));
  if (party.phone) lines.push(escapeHtml(party.phone));
  if (party.email) lines.push(escapeHtml(party.email));
  if (party.taxNumber) lines.push(`${escapeHtml(strings.taxNumberLabel)}: ${escapeHtml(party.taxNumber)}`);
  if (party.registrationNumber) {
    lines.push(`${escapeHtml(strings.registrationNumberLabel)}: ${escapeHtml(party.registrationNumber)}`);
  }
  return `<div class="doc-field__value">${lines.join("<br />")}</div>`;
}

function bankSection(bank: Record<string, string>, strings: PaymentDemandStrings): string {
  const lines: string[] = [];
  if (bank.accountNumber) lines.push(field(strings.bankDetailsLabel, bank.accountNumber));
  if (bank.iban) lines.push(field(strings.ibanLabel, bank.iban));
  if (bank.swiftBic) lines.push(field(strings.swiftBicLabel, bank.swiftBic));
  return lines.length > 0 ? `<div class="doc-section doc-card">${lines.join("")}</div>` : "";
}

function field(label: string, value: string): string {
  return `<div class="doc-field"><div class="doc-field__label">${escapeHtml(label)}</div><div class="doc-field__value">${escapeHtml(value)}</div></div>`;
}

function totalsRow(label: string, value: string, emphasized = false): string {
  const weight = emphasized ? "font-weight:600;font-size:15px;" : "";
  return `<div class="doc-field" style="display:flex;justify-content:space-between;${weight}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
}

function formatMoney(minor: number, currency: string, language: string): string {
  return new Intl.NumberFormat(language, { style: "currency", currency }).format(minor / 100);
}

function formatDate(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(iso));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
