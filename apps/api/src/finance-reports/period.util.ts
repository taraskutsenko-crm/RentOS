import { Temporal } from "@js-temporal/polyfill";
import { tenantLocalToUtc } from "@rentos/shared";

/**
 * Havelio Financial Reports & Analytics V1 — the tenant-timezone-aware
 * calendar-period resolver every report endpoint uses instead of each
 * inventing its own "this month" arithmetic. Mirrors the codebase's
 * existing Temporal-based approach (see packages/shared/tenant-timezone.ts,
 * D-115) rather than hand-rolled offset arithmetic.
 *
 * Two different date-comparison shapes come out of this, matching a real,
 * documented distinction in the schema (see docs/DECISIONS.md):
 *  - `dateOnlyRange` — for fields that are calendar dates stored as literal
 *    UTC-midnight instants with no real timezone meaning of their own
 *    (Invoice.issueDate/dueDate/saleDate, Payment.paymentDate — see
 *    apps/web's `formatBusinessDate` convention). Comparing these against
 *    a tenant-timezone-shifted boundary would double-convert them (the
 *    exact class of bug D-066 fixed for Rental's own naive fields) — so
 *    this range is anchored at UTC midnight of the resolved calendar date.
 *  - `instantRange` — for fields that are real UTC instants captured via
 *    `tenantLocalToUtc` (RentalDeposit.receivedAt/returnedAt — see D-115).
 *    These must be compared against the tenant's own local midnight,
 *    converted to the true UTC instant it represents.
 */
export type ReportPeriodPreset =
  | "THIS_MONTH"
  | "PREVIOUS_MONTH"
  | "LAST_30_DAYS"
  | "LAST_2_MONTHS"
  | "LAST_3_MONTHS"
  | "LAST_90_DAYS"
  | "THIS_QUARTER"
  | "PREVIOUS_QUARTER"
  | "THIS_YEAR"
  | "PREVIOUS_YEAR"
  | "ALL_TIME"
  | "CUSTOM";

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
] as const;

export class InvalidReportPeriodError extends Error {}

interface HalfOpenRange {
  /** `undefined` = no lower bound (ALL_TIME only). */
  gte?: Date;
  lt: Date;
}

export interface ResolvedPeriod {
  preset: ReportPeriodPreset;
  /** Inclusive calendar-date boundaries, tenant-timezone-resolved, for display. `fromDate` is `null` only for ALL_TIME's open start. */
  fromDate: string | null;
  toDate: string;
  dateOnlyRange: HalfOpenRange;
  instantRange: HalfOpenRange;
  /** The immediately-preceding equivalent period for comparison — `null` for ALL_TIME (no meaningful "previous all-time"), documented, not silently faked. */
  previous: ResolvedPeriod | null;
}

interface CalendarSpan {
  /** `null` = open-ended (ALL_TIME). */
  start: Temporal.PlainDate | null;
  /** Exclusive. */
  endExclusive: Temporal.PlainDate;
  previous: { start: Temporal.PlainDate; endExclusive: Temporal.PlainDate } | null;
}

function toRange(pd: Temporal.PlainDate): Date {
  return new Date(Date.UTC(pd.year, pd.month - 1, pd.day));
}

function toInstant(pd: Temporal.PlainDate, timezone: string): Date {
  const iso = pd.toString();
  return tenantLocalToUtc(`${iso}T00:00`, timezone);
}

function quarterStartMonth(month: number): number {
  return Math.floor((month - 1) / 3) * 3 + 1;
}

/**
 * Resolves one preset into its calendar span (and, except for ALL_TIME, the
 * immediately-preceding equivalent span) — `today` is the tenant-local
 * calendar date "now" resolves to, never the executing server/browser's
 * own date.
 */
function resolveSpan(
  preset: ReportPeriodPreset,
  today: Temporal.PlainDate,
  custom?: { from: string; to: string },
): CalendarSpan {
  switch (preset) {
    case "THIS_MONTH": {
      const start = today.with({ day: 1 });
      const endExclusive = start.add({ months: 1 });
      const previousStart = start.subtract({ months: 1 });
      return { start, endExclusive, previous: { start: previousStart, endExclusive: start } };
    }
    case "PREVIOUS_MONTH": {
      const endExclusive = today.with({ day: 1 });
      const start = endExclusive.subtract({ months: 1 });
      const previousStart = start.subtract({ months: 1 });
      return { start, endExclusive, previous: { start: previousStart, endExclusive: start } };
    }
    case "LAST_30_DAYS": {
      const endExclusive = today.add({ days: 1 });
      const start = endExclusive.subtract({ days: 30 });
      const previousStart = start.subtract({ days: 30 });
      return { start, endExclusive, previous: { start: previousStart, endExclusive: start } };
    }
    case "LAST_90_DAYS": {
      const endExclusive = today.add({ days: 1 });
      const start = endExclusive.subtract({ days: 90 });
      const previousStart = start.subtract({ days: 90 });
      return { start, endExclusive, previous: { start: previousStart, endExclusive: start } };
    }
    case "LAST_2_MONTHS": {
      const endExclusive = today.add({ days: 1 });
      const start = endExclusive.subtract({ months: 2 });
      const previousStart = start.subtract({ months: 2 });
      return { start, endExclusive, previous: { start: previousStart, endExclusive: start } };
    }
    case "LAST_3_MONTHS": {
      const endExclusive = today.add({ days: 1 });
      const start = endExclusive.subtract({ months: 3 });
      const previousStart = start.subtract({ months: 3 });
      return { start, endExclusive, previous: { start: previousStart, endExclusive: start } };
    }
    case "THIS_QUARTER": {
      const start = today.with({ month: quarterStartMonth(today.month), day: 1 });
      const endExclusive = start.add({ months: 3 });
      const previousStart = start.subtract({ months: 3 });
      return { start, endExclusive, previous: { start: previousStart, endExclusive: start } };
    }
    case "PREVIOUS_QUARTER": {
      const endExclusive = today.with({ month: quarterStartMonth(today.month), day: 1 });
      const start = endExclusive.subtract({ months: 3 });
      const previousStart = start.subtract({ months: 3 });
      return { start, endExclusive, previous: { start: previousStart, endExclusive: start } };
    }
    case "THIS_YEAR": {
      const start = today.with({ month: 1, day: 1 });
      const endExclusive = start.add({ years: 1 });
      const previousStart = start.subtract({ years: 1 });
      return { start, endExclusive, previous: { start: previousStart, endExclusive: start } };
    }
    case "PREVIOUS_YEAR": {
      const endExclusive = today.with({ month: 1, day: 1 });
      const start = endExclusive.subtract({ years: 1 });
      const previousStart = start.subtract({ years: 1 });
      return { start, endExclusive, previous: { start: previousStart, endExclusive: start } };
    }
    case "ALL_TIME": {
      // No meaningful "previous all-time" — comparison is intentionally
      // omitted for this preset (see ResolvedPeriod.previous doc comment).
      return { start: null, endExclusive: today.add({ days: 1 }), previous: null };
    }
    case "CUSTOM": {
      if (!custom?.from || !custom?.to) {
        throw new InvalidReportPeriodError("period=CUSTOM requires both `from` and `to`");
      }
      let start: Temporal.PlainDate;
      let endExclusive: Temporal.PlainDate;
      try {
        start = Temporal.PlainDate.from(custom.from);
        endExclusive = Temporal.PlainDate.from(custom.to).add({ days: 1 });
      } catch {
        throw new InvalidReportPeriodError(`Invalid date in custom range: "${custom.from}"/"${custom.to}"`);
      }
      if (Temporal.PlainDate.compare(start, endExclusive) >= 0) {
        throw new InvalidReportPeriodError("Custom range `from` must be before `to`");
      }
      const durationDays = start.until(endExclusive, { largestUnit: "day" }).days;
      const previousEndExclusive = start;
      const previousStart = start.subtract({ days: durationDays });
      return { start, endExclusive, previous: { start: previousStart, endExclusive: previousEndExclusive } };
    }
  }
}

function buildResolved(
  preset: ReportPeriodPreset,
  span: CalendarSpan,
  timezone: string,
  includePrevious: boolean,
): ResolvedPeriod {
  const previous =
    includePrevious && span.previous
      ? buildResolved(
          preset,
          { start: span.previous.start, endExclusive: span.previous.endExclusive, previous: null },
          timezone,
          false,
        )
      : null;

  return {
    preset,
    fromDate: span.start ? span.start.toString() : null,
    toDate: span.endExclusive.subtract({ days: 1 }).toString(),
    dateOnlyRange: {
      ...(span.start ? { gte: toRange(span.start) } : {}),
      lt: toRange(span.endExclusive),
    },
    instantRange: {
      ...(span.start ? { gte: toInstant(span.start, timezone) } : {}),
      lt: toInstant(span.endExclusive, timezone),
    },
    previous,
  };
}

/**
 * Resolves a period preset (plus, for CUSTOM, a `{from, to}` pair of plain
 * "YYYY-MM-DD" strings — the same shape the frontend's DatePicker already
 * produces) into UTC comparison ranges, always anchored to the TENANT's own
 * timezone's notion of "today" — never the executing browser's or server's
 * local date (see docs/DECISIONS.md).
 */
export function resolveReportPeriod(
  preset: ReportPeriodPreset,
  timezone: string,
  custom?: { from: string; to: string },
): ResolvedPeriod {
  let today: Temporal.PlainDate;
  try {
    today = Temporal.Now.zonedDateTimeISO(timezone).toPlainDate();
  } catch {
    throw new InvalidReportPeriodError(`Invalid tenant timezone: "${timezone}"`);
  }
  const span = resolveSpan(preset, today, custom);
  return buildResolved(preset, span, timezone, true);
}
