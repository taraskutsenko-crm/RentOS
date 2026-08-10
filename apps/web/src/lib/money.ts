/**
 * Converts a user-typed major-unit amount (e.g. "1234.56") to integer minor
 * units (123456) for the API, which never accepts floating-point money.
 * Assumes 2 decimal places for all currencies — a simplification; a
 * zero-decimal currency (e.g. JPY) would need its own minor-unit exponent,
 * out of scope for this task (see ADR 0002).
 */
export function toMinorUnits(display: string): number | undefined {
  const trimmed = display.trim();
  if (trimmed === "") {
    return undefined;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return Math.round(value * 100);
}

/** Converts integer minor units back to a display string, e.g. 123456 -> "1234.56". */
export function fromMinorUnits(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) {
    return "";
  }
  return (minor / 100).toFixed(2);
}

/**
 * `locale` defaults to the browser's own locale (`undefined`), same as
 * before — pass the active `i18n.language` explicitly from a component so
 * digit-grouping/symbol-placement follows the user's chosen UI language
 * rather than their OS locale (PRODUCT_BIBLE.md §28: currency is always an
 * explicit parameter here, never inferred from language — the `currency`
 * code and the display `locale` are independent inputs).
 */
export function formatMoney(
  minor: number | null | undefined,
  currency: string | null | undefined,
  locale?: string,
): string {
  if (minor === null || minor === undefined || !currency) {
    return "—";
  }
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}
