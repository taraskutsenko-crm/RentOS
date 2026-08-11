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

/**
 * e.g. "8/10/2026" (en) / "10.08.2026" (de) — locale-appropriate digits
 * only. `timeZone` is optional (mirrors `formatMoney`'s explicit-currency
 * pattern) — omitted, `Intl` falls back to the executing browser's local
 * timezone exactly as before this parameter existed. Pass the tenant's own
 * `Tenant.timezone` (already used server-side by quote-pdf.service.ts/
 * variable-resolver.service.ts) wherever a Rental/Quote date is displayed,
 * so the web app agrees with the PDF instead of silently using whichever
 * timezone the viewing browser happens to be in (see DECISIONS.md).
 */
export function formatDate(
  value: Date | string | number,
  locale: string,
  timeZone?: string,
): string {
  return new Intl.DateTimeFormat(locale, timeZone ? { timeZone } : undefined).format(toDate(value));
}

/** Date + time, e.g. "8/10/2026, 2:30 PM". See `formatDate` for `timeZone`. */
export function formatDateTime(
  value: Date | string | number,
  locale: string,
  timeZone?: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(toDate(value));
}

/** e.g. "August 2026" — used by month-cursor calendar headers. */
export function formatMonthYear(value: Date | string | number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(toDate(value));
}
