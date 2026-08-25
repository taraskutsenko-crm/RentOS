const BASIS_POINTS_DENOMINATOR = 10_000;

/**
 * The one canonical "amount × rate" tax primitive — every monetary
 * calculation in this codebase that turns a basis-point rate into a minor-
 * unit amount (Rental, Quote, Invoice) must call this, never reimplement
 * it (see docs/DECISIONS.md, rental tax percentage model — "every
 * monetary calculation must have ONE canonical implementation"). One
 * `Math.round()`, never chained; integer basis points only (2300 =
 * 23.00%), never a float rate — see ARCHITECTURE_LOCK.md §1.7.
 */
export function resolveTaxMinor(baseMinor: number, taxRateBp: number): number {
  if (taxRateBp <= 0 || baseMinor <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((baseMinor * taxRateBp) / BASIS_POINTS_DENOMINATOR));
}
