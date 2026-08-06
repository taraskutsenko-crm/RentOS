/**
 * A generated summary shown at the top of an Asset's Timeline page — see
 * docs/PRODUCT_BIBLE.md §12 (Timeline First) and docs/UI_REDESIGN_PLAN.md
 * Chapter 6. revenueGeneratedMinor is a read-time aggregate computed via
 * the canonical computeItemLineTotalMinor pricing function — never a
 * separately stored/recomputed total (see ARCHITECTURE_LOCK.md §1.4/§1.5).
 * Fields with no underlying data source (maintenance cost, utilization%)
 * are deliberately omitted rather than faked.
 */
export interface AssetSummary {
  totalRentals: number;
  revenueGeneratedMinor: number;
  currency: string | null;
  currentStatus: { id: string; code: string; name: string };
  currentLocation: string | null;
}
