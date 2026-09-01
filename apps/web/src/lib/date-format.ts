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

/** Time only, e.g. "2:30 PM" / "14:30" — for a same-day "Ends today · 16:30" style hint where the date itself is already implied. See `formatDate` for `timeZone`. */
export function formatTime(value: Date | string | number, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(toDate(value));
}

/** e.g. "August 2026" — used by month-cursor calendar headers. */
export function formatMonthYear(value: Date | string | number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(toDate(value));
}

/**
 * Rental/Quote `plannedStart`/`plannedEnd`/`issueDate`/`validUntil` are
 * Prisma `DateTime` columns mapped to Postgres "timestamp without time
 * zone" — a floating wall-clock value with no real-world instant attached.
 * The digits typed into the date/time picker pass straight through
 * unchanged (the API server runs with `TZ=UTC`, so `new Date("...T08:00")`
 * preserves the literal digits as a UTC-labeled `Date`). Formatting one of
 * these fields with the tenant's real IANA zone (`formatDate(value,
 * locale, tenant.timezone)`) re-interprets those already-literal digits as
 * a true UTC instant and shifts them again by the tenant's offset — a
 * double conversion that silently shows the wrong time for any tenant not
 * on UTC (see DECISIONS.md D-066). These two helpers read the literal
 * stored digits back exactly by formatting as UTC — use them for these
 * four naive fields specifically; real-instant fields (`actualStart`,
 * `returnedAt`, audit-log `occurredAt`, etc.) should keep using
 * `formatDate`/`formatDateTime` with the tenant's real timezone.
 */
export function formatBusinessDate(value: Date | string | number, locale: string): string {
  return formatDate(value, locale, "UTC");
}

export function formatBusinessDateTime(value: Date | string | number, locale: string): string {
  return formatDateTime(value, locale, "UTC");
}
