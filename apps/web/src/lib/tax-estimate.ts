const BASIS_POINTS_DENOMINATOR = 10_000;

/**
 * Client-side mirror of apps/api/src/common/tax.util.ts's `resolveTaxMinor` —
 * the single canonical tax-rate-to-amount conversion, shared by both the
 * Quote and Rental live-estimate mirrors so neither reinvents its own
 * rounding. The API always recomputes and stores the authoritative amount;
 * this is only for live UI feedback before submission.
 */
export function resolveTaxMinor(baseMinor: number, taxRateBp: number): number {
  if (taxRateBp <= 0 || baseMinor <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((baseMinor * taxRateBp) / BASIS_POINTS_DENOMINATOR));
}
