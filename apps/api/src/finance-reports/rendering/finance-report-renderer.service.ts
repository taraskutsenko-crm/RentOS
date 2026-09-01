import { Injectable } from "@nestjs/common";

import { BASE_DOCUMENT_CSS } from "../../documents/rendering/base-document-css";
import type { AgingBucket } from "../../payments/payment-status.util";
import type { OverviewRow } from "../finance-reports.service";
import { getFinanceReportStrings } from "./finance-report-strings";

const REPORT_CSS = `
.report-header { display:flex; align-items:center; justify-content:space-between; padding-bottom:20px; margin-bottom:28px; border-bottom:1px solid var(--doc-border); }
.report-header__brand { display:flex; align-items:center; gap:12px; }
.report-header__logo { max-height:36px; max-width:150px; object-fit:contain; }
.report-header__company { font-size:15px; font-weight:600; }
.report-header__meta { text-align:right; font-size:12px; color:var(--doc-ink-muted); }
.report-title { font-size:22px; font-weight:700; margin:0 0 4px; }
.report-subtitle { font-size:13px; color:var(--doc-ink-muted); margin:0 0 28px; }
.currency-section { margin-bottom:32px; page-break-inside:avoid; }
.currency-section__heading { font-size:15px; font-weight:700; margin:0 0 12px; padding-bottom:6px; border-bottom:2px solid var(--doc-accent); }
.kpi-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:20px; }
.kpi-card { border:1px solid var(--doc-border); border-radius:6px; padding:10px 12px; }
.kpi-card__label { font-size:10px; text-transform:uppercase; letter-spacing:.03em; color:var(--doc-ink-muted); margin:0 0 4px; }
.kpi-card__value { font-size:16px; font-weight:700; margin:0; }
.report-table { width:100%; border-collapse:collapse; font-size:12px; margin-bottom:8px; }
.report-table th { text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:.02em; color:var(--doc-ink-muted); border-bottom:1px solid var(--doc-border); padding:6px 8px; }
.report-table td { padding:6px 8px; border-bottom:1px solid var(--doc-bg-subtle); }
.report-table td.num, .report-table th.num { text-align:right; }
.aging-bar-row { display:flex; align-items:center; gap:8px; margin-bottom:4px; font-size:11px; }
.aging-bar-row__label { width:80px; flex-shrink:0; color:var(--doc-ink-muted); }
.aging-bar-row__track { flex:1; background:var(--doc-bg-subtle); border-radius:3px; height:10px; overflow:hidden; }
.aging-bar-row__fill { height:100%; background:var(--doc-accent); }
.aging-bar-row__fill.overdue { background:#dc2626; }
.aging-bar-row__value { width:90px; text-align:right; flex-shrink:0; }
.section-heading { font-size:13px; font-weight:700; margin:20px 0 10px; }
.empty-note { font-size:12px; color:var(--doc-ink-muted); font-style:italic; }
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

const AGING_BUCKET_LABELS: Record<AgingBucket, string> = {
  NOT_DUE: "Not due",
  "1_7_DAYS": "1–7 days",
  "8_30_DAYS": "8–30 days",
  "31_60_DAYS": "31–60 days",
  "61_90_DAYS": "61–90 days",
  "90_PLUS_DAYS": "90+ days",
};

export interface FinanceReportPdfInput {
  tenantName: string;
  logoBase64?: string | undefined;
  logoMimeType?: string | undefined;
  language: string;
  periodLabel: string;
  generatedAt: Date;
  overview: OverviewRow[];
  aging: { currency: string; buckets: { bucket: AgingBucket; outstandingMinor: number }[] }[];
  topCustomers: { currency: string; customerId: string; customerName: string; amountMinor: number }[];
  deposits: { currency: string; receivedMinor: number; returnedMinor: number; retainedMinor: number; appliedMinor: number; currentlyHeldMinor: number }[];
}

/**
 * Renders the A4 Financial Report PDF's HTML — a real, purpose-built
 * report layout (KPI cards, aging bars, tables), never a screenshot of
 * the live dashboard UI (see docs/PRODUCT_BIBLE.md §31). Reuses
 * BASE_DOCUMENT_CSS (the same foundation every Invoice/Document/Payment
 * Demand PDF uses) plus its own report-specific rules layered after it —
 * the exact same layering convention DocumentRendererService uses for a
 * tenant's custom template CSS.
 */
@Injectable()
export class FinanceReportRendererService {
  render(input: FinanceReportPdfInput): string {
    const strings = getFinanceReportStrings(input.language);
    const logoHtml =
      input.logoBase64 && input.logoMimeType
        ? `<img class="report-header__logo" src="data:${input.logoMimeType};base64,${input.logoBase64}" alt="${escapeHtml(input.tenantName)}" />`
        : "";

    const currencySections = input.overview
      .map((row) => this.renderCurrencySection(row, input, strings))
      .join("");

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(strings.title)}</title>
<style>${BASE_DOCUMENT_CSS}${REPORT_CSS}</style>
</head>
<body>
<div class="doc-page">
  <div class="report-header">
    <div class="report-header__brand">
      ${logoHtml}
      <span class="report-header__company">${escapeHtml(input.tenantName)}</span>
    </div>
    <div class="report-header__meta">
      ${escapeHtml(strings.generatedAt)}: ${escapeHtml(input.generatedAt.toISOString().slice(0, 16).replace("T", " "))} UTC
    </div>
  </div>
  <p class="report-title">${escapeHtml(strings.title)}</p>
  <p class="report-subtitle">${escapeHtml(strings.period)}: ${escapeHtml(input.periodLabel)}</p>
  ${currencySections || `<p class="empty-note">${escapeHtml(strings.noData)}</p>`}
</div>
</body>
</html>`;
  }

  private renderCurrencySection(
    row: OverviewRow,
    input: FinanceReportPdfInput,
    strings: ReturnType<typeof getFinanceReportStrings>,
  ): string {
    const aging = input.aging.find((a) => a.currency === row.currency);
    const maxAging = aging ? Math.max(1, ...aging.buckets.map((b) => b.outstandingMinor)) : 1;
    const topCustomers = input.topCustomers.filter((c) => c.currency === row.currency).slice(0, 10);
    const deposit = input.deposits.find((d) => d.currency === row.currency);

    return `
  <div class="currency-section">
    <p class="currency-section__heading">${escapeHtml(row.currency)}</p>
    <div class="kpi-grid">
      ${this.kpiCard(strings.invoiced, formatMoney(row.invoiced.currentMinor, row.currency))}
      ${this.kpiCard(strings.cashReceived, formatMoney(row.cashReceived.currentMinor, row.currency))}
      ${this.kpiCard(strings.outstanding, formatMoney(row.outstandingMinor, row.currency))}
      ${this.kpiCard(strings.overdue, formatMoney(row.overdueMinor, row.currency))}
      ${this.kpiCard(strings.tax, formatMoney(row.tax.currentMinor, row.currency))}
      ${this.kpiCard(strings.collectionRate, row.collectionRatePercent === null ? "—" : `${row.collectionRatePercent}%`)}
    </div>

    <p class="section-heading">${escapeHtml(strings.receivableAging)}</p>
    ${
      aging
        ? aging.buckets
            .map(
              (b) => `
      <div class="aging-bar-row">
        <span class="aging-bar-row__label">${escapeHtml(AGING_BUCKET_LABELS[b.bucket])}</span>
        <span class="aging-bar-row__track"><span class="aging-bar-row__fill${b.bucket === "NOT_DUE" ? "" : " overdue"}" style="width:${Math.round((b.outstandingMinor / maxAging) * 100)}%"></span></span>
        <span class="aging-bar-row__value">${formatMoney(b.outstandingMinor, row.currency)}</span>
      </div>`,
            )
            .join("")
        : `<p class="empty-note">${escapeHtml(strings.noData)}</p>`
    }

    <p class="section-heading">${escapeHtml(strings.topCustomers)}</p>
    ${
      topCustomers.length > 0
        ? `<table class="report-table"><thead><tr><th>${escapeHtml(strings.customer)}</th><th class="num">${escapeHtml(strings.amount)}</th></tr></thead><tbody>
      ${topCustomers.map((c) => `<tr><td>${escapeHtml(c.customerName)}</td><td class="num">${formatMoney(c.amountMinor, row.currency)}</td></tr>`).join("")}
      </tbody></table>`
        : `<p class="empty-note">${escapeHtml(strings.noData)}</p>`
    }

    <p class="section-heading">${escapeHtml(strings.deposits)}</p>
    ${
      deposit
        ? `<table class="report-table"><tbody>
      <tr><td>${escapeHtml(strings.depositsReceived)}</td><td class="num">${formatMoney(deposit.receivedMinor, row.currency)}</td></tr>
      <tr><td>${escapeHtml(strings.depositsReturned)}</td><td class="num">${formatMoney(deposit.returnedMinor, row.currency)}</td></tr>
      <tr><td>${escapeHtml(strings.depositsRetained)}</td><td class="num">${formatMoney(deposit.retainedMinor, row.currency)}</td></tr>
      <tr><td>${escapeHtml(strings.depositsApplied)}</td><td class="num">${formatMoney(deposit.appliedMinor, row.currency)}</td></tr>
      <tr><td><strong>${escapeHtml(strings.depositsHeld)}</strong></td><td class="num"><strong>${formatMoney(deposit.currentlyHeldMinor, row.currency)}</strong></td></tr>
      </tbody></table>`
        : `<p class="empty-note">${escapeHtml(strings.noData)}</p>`
    }
  </div>`;
  }

  private kpiCard(label: string, value: string): string {
    return `<div class="kpi-card"><p class="kpi-card__label">${escapeHtml(label)}</p><p class="kpi-card__value">${escapeHtml(value)}</p></div>`;
  }
}

