import { Injectable } from "@nestjs/common";

import { BASE_DOCUMENT_CSS } from "../../documents/rendering/base-document-css";
import type { InvoiceDetailView, InvoiceItemView } from "../invoice.types";
import { getInvoiceStrings } from "./invoice-strings";

export interface RenderedInvoiceHtml {
  html: string;
}

/**
 * Renders an Invoice's HTML directly from its own data — deliberately NOT
 * routed through the generic Document `{{placeholder}}` template pipeline
 * (VariableResolverService/DocumentRendererService), since Invoice is its
 * own first-class model with its own data shape (see docs/DECISIONS.md).
 * It still reuses two pieces of that pipeline: the shared
 * `BASE_DOCUMENT_CSS` stylesheet (so an invoice looks visually consistent
 * with a Contract/Handover/Return) and, for the actual PDF bytes,
 * `PdfRendererService.renderPdf` (see invoice-pdf.service.ts) — the same
 * Puppeteer engine, no second PDF renderer introduced.
 *
 * Renders straight from `sellerSnapshot`/`buyerSnapshot`/`bankSnapshot` and
 * the invoice's own stored line items/totals — never from a live Tenant/
 * Customer/CompanyBankAccount lookup — so an ISSUED invoice's rendered
 * output is byte-for-byte reproducible forever, satisfying the
 * immutability requirement without needing DocumentVersion/
 * templateVersionId's pinning machinery (there is nothing to pin: the
 * snapshot itself IS the pinned content). Language is
 * `invoice.documentLanguage`, frozen at issue time — never the viewer's UI
 * language (see resolveDefaultDocumentLanguage / DECISIONS.md D-071).
 */
@Injectable()
export class InvoiceRendererService {
  render(invoice: InvoiceDetailView): RenderedInvoiceHtml {
    const strings = getInvoiceStrings(invoice.documentLanguage);
    const seller = invoice.sellerSnapshot as Record<string, string>;
    const buyer = invoice.buyerSnapshot as Record<string, string>;
    const bank = invoice.bankSnapshot as Record<string, string> | null;

    const title = invoice.type === "PROFORMA" ? strings.proformaTitle : strings.title;
    const money = (minor: number) => formatMoney(minor, invoice.currency, invoice.documentLanguage);
    const date = (iso: string | null) => (iso ? formatDate(iso, invoice.documentLanguage) : "");

    const itemsRows = invoice.items.map((item) => itemRow(item, money)).join("\n");

    const html = `
<!doctype html>
<html lang="${escapeHtml(invoice.documentLanguage)}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(invoice.invoiceNumber)}</title>
<style>${BASE_DOCUMENT_CSS}</style>
</head>
<body>
<div class="doc-page">
  <div class="doc-header">
    <div class="doc-header__brand">
      <div class="doc-header__company">${escapeHtml(String(seller.name ?? ""))}</div>
    </div>
    <div class="doc-header__meta">
      ${escapeHtml(invoice.invoiceNumber)}<br />
      ${escapeHtml(date(invoice.issueDate))}
    </div>
  </div>

  <h1 class="doc-title">${escapeHtml(title)}</h1>
  <p class="doc-subtitle">${escapeHtml(strings.invoiceNumber)}: ${escapeHtml(invoice.invoiceNumber)}</p>

  <div class="doc-section doc-grid">
    <div>
      <div class="doc-section__title">${escapeHtml(strings.seller)}</div>
      ${partyBlock(seller, strings)}
    </div>
    <div>
      <div class="doc-section__title">${escapeHtml(strings.buyer)}</div>
      ${partyBlock(buyer, strings)}
    </div>
  </div>

  <div class="doc-section doc-grid">
    <div class="doc-field">
      <div class="doc-field__label">${escapeHtml(strings.issueDate)}</div>
      <div class="doc-field__value">${escapeHtml(date(invoice.issueDate))}</div>
    </div>
    ${
      invoice.saleDate
        ? `<div class="doc-field">
      <div class="doc-field__label">${escapeHtml(strings.saleDate)}</div>
      <div class="doc-field__value">${escapeHtml(date(invoice.saleDate))}</div>
    </div>`
        : ""
    }
    ${
      invoice.dueDate
        ? `<div class="doc-field">
      <div class="doc-field__label">${escapeHtml(strings.dueDate)}</div>
      <div class="doc-field__value">${escapeHtml(date(invoice.dueDate))}</div>
    </div>`
        : ""
    }
  </div>

  <div class="doc-section">
    <table class="doc-table">
      <thead>
        <tr>
          <th>${escapeHtml(strings.itemDescription)}</th>
          <th class="doc-table__num">${escapeHtml(strings.quantity)}</th>
          <th>${escapeHtml(strings.unit)}</th>
          <th class="doc-table__num">${escapeHtml(strings.unitPrice)}</th>
          <th class="doc-table__num">${escapeHtml(strings.netValue)}</th>
          <th class="doc-table__num">${escapeHtml(strings.taxRateLabel)}</th>
          <th class="doc-table__num">${escapeHtml(strings.taxAmount)}</th>
          <th class="doc-table__num">${escapeHtml(strings.grossValue)}</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>
  </div>

  <div class="doc-section" style="display: flex; justify-content: flex-end;">
    <div style="min-width: 280px;">
      ${totalsRow(strings.subtotalLabel, money(invoice.subtotalMinor))}
      ${invoice.discountMinor > 0 ? totalsRow(strings.discountLabel, `-${money(invoice.discountMinor)}`) : ""}
      ${totalsRow(strings.taxLabel, money(invoice.taxMinor))}
      ${totalsRow(strings.totalLabel, money(invoice.totalMinor), true)}
      ${invoice.paidMinor > 0 ? totalsRow(strings.paidLabel, money(invoice.paidMinor)) : ""}
      ${totalsRow(strings.amountDueLabel, money(invoice.remainingMinor), true)}
    </div>
  </div>

  ${bank ? bankSection(bank, strings, invoice) : ""}

  ${
    invoice.notes
      ? `<div class="doc-section">
    <div class="doc-section__title">${escapeHtml(strings.notesLabel)}</div>
    <p class="doc-notes">${escapeHtml(invoice.notes)}</p>
  </div>`
      : ""
  }

  <div class="doc-footer">
    <span>${escapeHtml(strings.generatedWith)}</span>
  </div>
</div>
</body>
</html>`;

    return { html };
  }
}

function partyBlock(party: Record<string, string>, strings: InvoiceStrings): string {
  const lines: string[] = [];
  if (party.name) lines.push(escapeHtml(party.name));
  if (party.address) lines.push(escapeHtml(party.address));
  if (party.phone) lines.push(escapeHtml(party.phone));
  if (party.email) lines.push(escapeHtml(party.email));
  if (party.taxNumber)
    lines.push(`${escapeHtml(strings.taxNumberLabel)}: ${escapeHtml(party.taxNumber)}`);
  if (party.registrationNumber) {
    lines.push(
      `${escapeHtml(strings.registrationNumberLabel)}: ${escapeHtml(party.registrationNumber)}`,
    );
  }
  return `<div class="doc-field__value">${lines.join("<br />")}</div>`;
}

function bankSection(
  bank: Record<string, string>,
  strings: InvoiceStrings,
  invoice: InvoiceDetailView,
): string {
  const lines: string[] = [];
  if (invoice.preferredPaymentMethod) {
    lines.push(field(strings.paymentMethodLabel, invoice.preferredPaymentMethod));
  }
  if (bank.accountNumber) lines.push(field(strings.bankAccountNumberLabel, bank.accountNumber));
  if (bank.iban) lines.push(field(strings.ibanLabel, bank.iban));
  if (bank.swiftBic) lines.push(field(strings.swiftBicLabel, bank.swiftBic));
  if (invoice.paymentReference)
    lines.push(field(strings.paymentReferenceLabel, invoice.paymentReference));
  return `<div class="doc-section doc-card">${lines.join("")}</div>`;
}

function field(label: string, value: string): string {
  return `<div class="doc-field"><div class="doc-field__label">${escapeHtml(label)}</div><div class="doc-field__value">${escapeHtml(value)}</div></div>`;
}

function totalsRow(label: string, value: string, emphasized = false): string {
  const weight = emphasized ? "font-weight:600;font-size:15px;" : "";
  return `<div class="doc-field" style="display:flex;justify-content:space-between;${weight}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
}

function itemRow(item: InvoiceItemView, money: (minor: number) => string): string {
  return `<tr>
  <td>${escapeHtml(item.description)}</td>
  <td class="doc-table__num">${item.quantity}</td>
  <td>${escapeHtml(item.unit ?? "")}</td>
  <td class="doc-table__num">${money(item.unitNetPriceMinor)}</td>
  <td class="doc-table__num">${money(item.netTotalMinor)}</td>
  <td class="doc-table__num">${(item.taxRateBp / 100).toFixed(2)}%</td>
  <td class="doc-table__num">${money(item.taxTotalMinor)}</td>
  <td class="doc-table__num">${money(item.grossTotalMinor)}</td>
</tr>`;
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

type InvoiceStrings = ReturnType<typeof getInvoiceStrings>;
