import type { ReportPeriodPreset } from "../types/finance-reports";

/** Every period preset in display order — the exact 12 options Financial Reports & Analytics V1 requires (docs/PRODUCT_BIBLE.md §5). */
export const REPORT_PERIOD_PRESETS: ReportPeriodPreset[] = [
  "THIS_MONTH",
  "PREVIOUS_MONTH",
  "LAST_30_DAYS",
  "LAST_2_MONTHS",
  "LAST_3_MONTHS",
  "LAST_90_DAYS",
  "THIS_QUARTER",
  "PREVIOUS_QUARTER",
  "THIS_YEAR",
  "PREVIOUS_YEAR",
  "ALL_TIME",
  "CUSTOM",
];
