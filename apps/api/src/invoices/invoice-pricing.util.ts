import { resolveTaxMinor } from "../quotes/quote-pricing.util";

/**
 * One Invoice line's pricing input — generic enough for a rented asset,
 * delivery, pickup, installation, cleaning, fuel, transport, a damage
 * charge, a late fee, or any other goods/service (see docs/DECISIONS.md).
 * Deliberately simpler than QuoteItem's discount model (a flat
 * `discountMinor`, not a type+value pair) since an invoice line is
 * typically prefilled from an already-priced Rental/Quote item rather than
 * independently negotiated.
 */
export interface PricedInvoiceItemInput {
  quantity: number;
  unitNetPriceMinor: number;
  discountMinor?: number;
  /** Integer basis points (2300 = 23.00%) — never a float rate. */
  taxRateBp: number;
}

export interface InvoiceItemPricingResult {
  netTotalMinor: number;
  taxTotalMinor: number;
  grossTotalMinor: number;
}

export interface InvoiceTotals {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export interface InvoiceTotalsResult extends InvoiceTotals {
  items: InvoiceItemPricingResult[];
}

/**
 * Computes one invoice line's net/tax/gross breakdown, reusing
 * `resolveTaxMinor` (the same integer-basis-point tax primitive
 * Quote/Rental pricing already uses — see quote-pricing.util.ts) rather
 * than reinventing tax arithmetic. `discountMinor` is subtracted from the
 * line's gross-before-tax amount, clamped to zero, before tax is applied —
 * matching Quote's "discount, then tax on the discounted amount" order.
 */
export function computeInvoiceItemPricing(item: PricedInvoiceItemInput): InvoiceItemPricingResult {
  const lineSubtotalMinor = item.unitNetPriceMinor * item.quantity;
  const discountMinor = Math.min(lineSubtotalMinor, Math.max(0, item.discountMinor ?? 0));
  const netTotalMinor = Math.max(0, lineSubtotalMinor - discountMinor);
  const taxTotalMinor = resolveTaxMinor(netTotalMinor, item.taxRateBp);
  const grossTotalMinor = netTotalMinor + taxTotalMinor;

  return { netTotalMinor, taxTotalMinor, grossTotalMinor };
}

/**
 * subtotal/tax/total are aggregates of each line's own already-discounted,
 * already-taxed breakdown — exact integer-money arithmetic throughout, one
 * `Math.round` per line (inside `resolveTaxMinor`), never chained, never a
 * float/Decimal library (see ADR 0007).
 */
export function computeInvoiceTotals(items: PricedInvoiceItemInput[]): InvoiceTotalsResult {
  const itemResults = items.map((item) => computeInvoiceItemPricing(item));
  const subtotalMinor = itemResults.reduce((sum, result) => sum + result.netTotalMinor, 0);
  const taxMinor = itemResults.reduce((sum, result) => sum + result.taxTotalMinor, 0);
  const discountMinor = items.reduce((sum, item) => sum + Math.max(0, item.discountMinor ?? 0), 0);
  const totalMinor = itemResults.reduce((sum, result) => sum + result.grossTotalMinor, 0);

  return { items: itemResults, subtotalMinor, discountMinor, taxMinor, totalMinor };
}
