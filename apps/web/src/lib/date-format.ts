/**
 * Locale-aware date/time formatting built on `Intl.DateTimeFormat` — the
 * shared util `date.toLocaleDateString()`/`.toLocaleString()` call sites
 * across the app should use instead of rolling their own options object
 * (see DECISIONS.md D-057). Callers pass the active `i18n.language`
 * explicitly (mirrors `formatMoney`'s explicit `currency` parameter) so
 * date formatting follows the user's chosen UI language rather than the
 * browser's default locale.
 */

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** e.g. "8/10/2026" (en) / "10.08.2026" (de) — locale-appropriate digits only. */
export function formatDate(value: Date | string | number, locale: string): string {
  return new Intl.DateTimeFormat(locale).format(toDate(value));
}

/** Date + time, e.g. "8/10/2026, 2:30 PM". */
export function formatDateTime(value: Date | string | number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(toDate(value));
}

/** e.g. "August 2026" — used by month-cursor calendar headers. */
export function formatMonthYear(value: Date | string | number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(toDate(value));
}
