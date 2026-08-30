/**
 * Havelio Time Model — the single canonical conversion layer between a
 * tenant's local wall-clock rental times and the true UTC instants stored
 * in the database (see docs/PRODUCT_BIBLE.md "Havelio Time Model" and
 * docs/DECISIONS.md D-115). Superseding D-066: `Rental.plannedStart` /
 * `plannedEnd`, `Quote.plannedStart` / `plannedEnd` / `validUntil`,
 * `AssetAvailabilityBlock.startAt` / `endAt`, and
 * `RentalDeposit.receivedAt` / `returnedAt` are now real UTC instants, not
 * floating/naive wall-clock digits — every comparison against `Date.now()`
 * or another instant (`RentalsService.start()`, `AvailabilityService`,
 * `deriveOverdueStatus`) is correct with zero further conversion.
 *
 * Used by BOTH `apps/api` (server-side write-path validation and
 * PATCH/PUT DTO parsing) and `apps/web` (the rental/quote/block wizards'
 * submit handlers, and re-populating a `DateTimeField` from a stored
 * instant when editing) — one implementation, not duplicated per side.
 *
 * Built on `@js-temporal/polyfill` (the TC39 Temporal reference
 * implementation) rather than hand-rolled offset arithmetic — DST
 * gap/fold detection is delegated to `Temporal.TimeZone#getPossibleInstantsFor`,
 * the spec-correct ground truth, never guessed at.
 */
import { Temporal } from "@js-temporal/polyfill";

/**
 * Thrown by `tenantLocalToUtc` when the given local wall-clock reading does
 * not exist in the given timezone — a DST "spring forward" gap (e.g.
 * `2026-03-08T02:30` in `America/New_York`, skipped entirely that day).
 * Callers must surface this as a validation error, never silently shift to
 * a different instant.
 */
export class TenantLocalTimeGapError extends Error {
  constructor(
    public readonly localDateTime: string,
    public readonly timezone: string,
  ) {
    super(
      `"${localDateTime}" does not exist in timezone "${timezone}" — likely a DST spring-forward gap. Choose a different time.`,
    );
    this.name = "TenantLocalTimeGapError";
  }
}

/** Thrown when the local date-time string itself is malformed (not a parse-time IANA-zone concern). */
export class InvalidLocalDateTimeError extends Error {
  constructor(public readonly localDateTime: string) {
    super(`"${localDateTime}" is not a valid local date-time (expected "YYYY-MM-DDTHH:mm[:ss]").`);
    this.name = "InvalidLocalDateTimeError";
  }
}

/**
 * Converts a tenant-local wall-clock reading (the exact "YYYY-MM-DDTHH:mm"
 * shape `DateTimeField`/native `datetime-local` inputs already produce) —
 * interpreted as wall-clock time IN `timezone` — into the real UTC instant
 * it represents.
 *
 * DST handling (ground truth via `Temporal.TimeZone#getPossibleInstantsFor`,
 * never manual arithmetic):
 * - Normal reading (one matching instant): returned directly.
 * - Nonexistent reading (spring-forward gap, zero matching instants):
 *   throws `TenantLocalTimeGapError` — the caller must ask the user to pick
 *   a different time, never silently save a shifted instant.
 * - Ambiguous reading (fall-back fold, two matching instants — the same
 *   wall-clock digits occur twice): deterministically resolves to the
 *   EARLIER of the two real instants. This is a documented, fixed rule
 *   (not "explicit resolution UI," which no picker in this codebase
 *   supports today) — matches the pre-fold offset, consistent every time
 *   for the same input.
 */
export function tenantLocalToUtc(localDateTime: string, timezone: string): Date {
  let plainDateTime: Temporal.PlainDateTime;
  try {
    plainDateTime = Temporal.PlainDateTime.from(localDateTime);
  } catch {
    throw new InvalidLocalDateTimeError(localDateTime);
  }

  const tz = Temporal.TimeZone.from(timezone);
  const possibleInstants = tz.getPossibleInstantsFor(plainDateTime);

  if (possibleInstants.length === 0) {
    throw new TenantLocalTimeGapError(localDateTime, timezone);
  }

  const chosen =
    possibleInstants.length === 1
      ? possibleInstants[0]!
      : possibleInstants.reduce((earlier, candidate) =>
          Temporal.Instant.compare(candidate, earlier) < 0 ? candidate : earlier,
        );

  return new Date(chosen.epochMilliseconds);
}

/**
 * The inverse of `tenantLocalToUtc`: given a real UTC instant, returns the
 * "YYYY-MM-DDTHH:mm" wall-clock reading as seen in `timezone` — the exact
 * shape needed to re-populate a `DateTimeField` when opening an existing
 * Rental/Quote/block for editing. Unlike the local→UTC direction, this
 * conversion is always well-defined (a real instant is never ambiguous or
 * nonexistent in any zone), so no error case exists here.
 */
export function utcToTenantLocal(instant: Date | string, timezone: string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  const zoned = Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timezone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${zoned.year}-${pad(zoned.month)}-${pad(zoned.day)}T${pad(zoned.hour)}:${pad(zoned.minute)}`;
}

/**
 * True when `localDateTime` (interpreted in `timezone`) is a real, existing
 * wall-clock reading — i.e. `tenantLocalToUtc` would not throw
 * `TenantLocalTimeGapError`. Lets a form validate a DST gap inline (a field
 * error next to the picker) instead of only discovering it from a caught
 * exception at submit time.
 */
export function isValidTenantLocalDateTime(localDateTime: string, timezone: string): boolean {
  try {
    tenantLocalToUtc(localDateTime, timezone);
    return true;
  } catch (error) {
    if (error instanceof TenantLocalTimeGapError) {
      return false;
    }
    throw error;
  }
}

/**
 * The full list of IANA timezone identifiers this runtime knows about, for
 * a Company Profile timezone `<select>` — sourced from `Intl.supportedValuesOf`
 * (Node 20+/every evergreen browser), never a hand-maintained list that can
 * drift from the real tzdata. Falls back to a small, common curated set on
 * a runtime that lacks `Intl.supportedValuesOf` (defensive only — every
 * target runtime for this app supports it).
 */
export function listSupportedTimezones(): string[] {
  const intlWithSupportedValuesOf = Intl as unknown as {
    supportedValuesOf?: (key: string) => string[];
  };
  if (typeof intlWithSupportedValuesOf.supportedValuesOf === "function") {
    return intlWithSupportedValuesOf.supportedValuesOf("timeZone");
  }
  return [
    "UTC",
    "Europe/Warsaw",
    "Europe/London",
    "Europe/Berlin",
    "America/New_York",
    "America/Los_Angeles",
    "America/Chicago",
    "Asia/Dubai",
    "Asia/Tokyo",
    "Australia/Sydney",
  ];
}

/** True when `timezone` is a real, IANA-recognized zone identifier — used to validate `Tenant.timezone` on write. */
export function isValidIanaTimezone(timezone: string): boolean {
  try {
    Temporal.TimeZone.from(timezone);
    return true;
  } catch {
    return false;
  }
}
