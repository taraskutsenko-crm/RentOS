/**
 * A generated summary shown at the top of a Customer's Timeline page — see
 * docs/PRODUCT_BIBLE.md §12 (Timeline First) and docs/UI_REDESIGN_PLAN.md
 * Chapter 6. Every field is a real aggregate over the customer's own
 * records; fields with no underlying data source (overdue invoices,
 * payment reliability) are deliberately omitted rather than faked.
 */
export interface CustomerSummary {
  customerSince: string;
  totalRentals: number;
  activeRentals: number;
  totalRevenueMinor: number;
  currency: string | null;
  lastActivityAt: string | null;
  damageReportsCount: number;
}
