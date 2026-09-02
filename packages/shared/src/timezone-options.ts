/**
 * Havelio's international timezone SELECTOR data — purely a presentation
 * layer over `listSupportedTimezones()` (tenant-timezone.ts). The canonical
 * stored value is, and always remains, the raw IANA identifier — nothing
 * here ever produces or accepts a numeric-offset-only value (see
 * docs/DECISIONS.md: numeric UTC offsets alone cannot represent DST).
 *
 * Every offset shown here is computed from the real IANA zone at a given
 * instant via `@js-temporal/polyfill` — never a hand-maintained
 * city→offset table, which would silently go wrong across a DST
 * transition. `buildTimezoneOptions(at)` recomputes on demand, so calling
 * it around a DST boundary correctly reflects the pre/post-transition
 * offset for each zone.
 */
import { Temporal } from "@js-temporal/polyfill";

import { listSupportedTimezones } from "./tenant-timezone.js";

export interface TimezoneOption {
  /** Canonical IANA identifier — the only value ever persisted as tenant.timezone. */
  value: string;
  /** Human-readable city/region label derived from the IANA id, e.g. "Warsaw", "Buenos Aires". */
  label: string;
  /** Signed offset from UTC in minutes at the reference instant, e.g. 120 for UTC+02:00, -270 for UTC-04:30. */
  offsetMinutes: number;
  /** "+02:00" / "-04:00" / "+05:30" — always HH:MM, sign always present. */
  offsetLabel: string;
  /** "UTC+02:00 — Warsaw" — the primary combobox row/trigger text. */
  displayLabel: string;
  /** Lowercased extra terms (country/region aliases) this option should also match on search, beyond its own id/label. */
  searchTerms: string[];
}

export interface TimezoneOptionGroup {
  offsetMinutes: number;
  /** "UTC+02:00" for display as a group header (or "UTC±00:00" at zero — see formatUtcOffsetLabel). */
  groupLabel: string;
  options: TimezoneOption[];
}

/**
 * A light, deliberately incomplete set of search aliases (country/region
 * names that don't appear anywhere in the IANA identifier itself) for the
 * IANA zone most people would reach for when typing that name — e.g.
 * "Poland" → Europe/Warsaw. This never changes which zones are
 * SELECTABLE (that list is always the full runtime-derived
 * `listSupportedTimezones()`, per Havelio's "no hand-curated subset of
 * major cities" rule) — it only improves search recall for a common query
 * shape. Countries that span many zones with no single obvious default
 * (e.g. the US, Russia, Brazil) are deliberately omitted rather than
 * guessing which zone "is" that country.
 */
const SEARCH_ALIASES: Record<string, string[]> = {
  "Europe/Warsaw": ["poland", "polska"],
  "Europe/London": ["uk", "united kingdom", "england", "britain", "great britain"],
  "Europe/Berlin": ["germany", "deutschland"],
  "Europe/Paris": ["france"],
  "Europe/Rome": ["italy", "italia"],
  "Europe/Prague": ["czechia", "czech republic"],
  "Europe/Vienna": ["austria"],
  "Europe/Madrid": ["spain"],
  "Europe/Amsterdam": ["netherlands", "holland"],
  "Europe/Lisbon": ["portugal"],
  "Europe/Stockholm": ["sweden"],
  "Europe/Oslo": ["norway"],
  "Europe/Copenhagen": ["denmark"],
  "Europe/Helsinki": ["finland"],
  "Europe/Athens": ["greece"],
  "Europe/Budapest": ["hungary"],
  "Europe/Bucharest": ["romania"],
  "Europe/Kyiv": ["ukraine"],
  "Europe/Moscow": ["russia"],
  "Europe/Dublin": ["ireland"],
  "Europe/Zurich": ["switzerland"],
  "Europe/Brussels": ["belgium"],
  "Asia/Dubai": ["uae", "united arab emirates"],
  // Some runtimes' ICU/tzdata still report the legacy canonical spellings
  // (Asia/Calcutta, Asia/Katmandu) as links-target rather than the modern
  // IANA names (Asia/Kolkata, Asia/Kathmandu) — both are real, valid,
  // functionally identical IANA identifiers (see isValidIanaTimezone),
  // just different canonical spellings depending on the platform's tzdata
  // vintage. Aliasing both directions keeps search working the same way
  // regardless of which one a given deployment's runtime returns.
  "Asia/Kolkata": ["india"],
  "Asia/Calcutta": ["india", "kolkata"],
  "Asia/Kathmandu": ["nepal"],
  "Asia/Katmandu": ["nepal", "kathmandu"],
  "Asia/Tokyo": ["japan"],
  "Asia/Shanghai": ["china"],
  "Asia/Seoul": ["south korea", "korea"],
  "Asia/Singapore": ["singapore"],
  "Asia/Bangkok": ["thailand"],
  "Asia/Jakarta": ["indonesia"],
  "Asia/Manila": ["philippines"],
  "Asia/Karachi": ["pakistan"],
  "Asia/Dhaka": ["bangladesh"],
  "Asia/Istanbul": ["turkey", "turkiye"],
  "Asia/Jerusalem": ["israel"],
  "Asia/Riyadh": ["saudi arabia"],
  "Australia/Sydney": ["australia"],
  "Australia/Adelaide": ["australia"],
  "America/Sao_Paulo": ["brazil", "brasil"],
  "America/Mexico_City": ["mexico"],
  "America/Toronto": ["canada"],
  "America/Bogota": ["colombia"],
  "America/Buenos_Aires": ["argentina"],
  "America/Argentina/Buenos_Aires": ["argentina"],
  "America/Santiago": ["chile"],
  "Africa/Cairo": ["egypt"],
  "Africa/Johannesburg": ["south africa"],
  "Africa/Lagos": ["nigeria"],
  "Africa/Nairobi": ["kenya"],
  "Pacific/Auckland": ["new zealand"],
};

/** "+02:00" / "-04:30" — always signed, always HH:MM (never bare hours), so fractional offsets render correctly. */
export function formatUtcOffsetLabel(
  offsetMinutes: number,
  options: { zeroSign?: "+" | "±" } = {},
): string {
  const zeroSign = options.zeroSign ?? "+";
  const sign = offsetMinutes === 0 ? zeroSign : offsetMinutes > 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `UTC${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** "Europe/Warsaw" → "Warsaw"; "America/Argentina/Buenos_Aires" → "Buenos Aires". Never hardcoded per-zone — derived generically from the IANA id's final segment. */
export function getTimezoneCityLabel(ianaZone: string): string {
  const lastSegment = ianaZone.split("/").pop() ?? ianaZone;
  return lastSegment.replace(/_/g, " ");
}

/**
 * Builds the full selectable option set from `listSupportedTimezones()`
 * (the runtime's real IANA database — see its own doc comment), each
 * carrying the CURRENT offset as of `at`. Excludes the handful of
 * non-geographic `Etc/*` entries (e.g. "Etc/GMT+5") — real IANA zones,
 * but not something a human names a company's timezone by; UTC itself is
 * kept since it's a legitimate, commonly-chosen selection.
 */
export function buildTimezoneOptions(at: Date = new Date()): TimezoneOption[] {
  const instant = Temporal.Instant.fromEpochMilliseconds(at.getTime());
  return listSupportedTimezones()
    .filter((zone) => zone === "UTC" || !zone.startsWith("Etc/"))
    .map((zone) => {
      const zoned = instant.toZonedDateTimeISO(zone);
      const offsetMinutes = Math.round(zoned.offsetNanoseconds / 60_000_000_000);
      const prefixedOffset = formatUtcOffsetLabel(offsetMinutes);
      const label = zone === "UTC" ? "UTC" : getTimezoneCityLabel(zone);
      return {
        value: zone,
        label,
        offsetMinutes,
        // Bare "+02:00" (no "UTC" prefix) — shown as small secondary text
        // next to each option's city name; the group header above it
        // already says "UTC+02:00" once for the whole group.
        offsetLabel: prefixedOffset.slice(3),
        displayLabel: `${prefixedOffset} — ${label}`,
        searchTerms: SEARCH_ALIASES[zone] ?? [],
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Groups already-built options by their current offset, sorted ascending (UTC-12:00 first, UTC+14:00 last); each group's own options stay alphabetical by label. Zero-offset group header uses "UTC±00:00" per Havelio's convention. */
export function groupTimezoneOptionsByOffset(options: TimezoneOption[]): TimezoneOptionGroup[] {
  const byOffset = new Map<number, TimezoneOption[]>();
  for (const option of options) {
    const bucket = byOffset.get(option.offsetMinutes);
    if (bucket) bucket.push(option);
    else byOffset.set(option.offsetMinutes, [option]);
  }
  return [...byOffset.entries()]
    .sort(([a], [b]) => a - b)
    .map(([offsetMinutes, groupOptions]) => ({
      offsetMinutes,
      groupLabel: formatUtcOffsetLabel(offsetMinutes, { zeroSign: "±" }),
      options: groupOptions,
    }));
}

/**
 * Matches a free-text query against an option's IANA id, human label, and
 * search aliases, plus numeric-offset shapes ("+2", "UTC+2", "UTC+02:00",
 * "-4") against its current offset — covers every example in the product
 * spec ("Warsaw", "Poland", "Europe/Warsaw", "+2", "UTC+2", "New York",
 * "-4"). Case-insensitive; whitespace-trimmed.
 */
export function timezoneOptionMatchesQuery(option: TimezoneOption, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  if (
    option.value.toLowerCase().includes(normalized) ||
    option.label.toLowerCase().includes(normalized) ||
    option.searchTerms.some((term) => term.includes(normalized))
  ) {
    return true;
  }

  // Numeric-offset query shapes: "+2", "-4", "2", "utc+2", "utc+02:00", "gmt+2".
  const offsetMatch = /^(?:utc|gmt)?\s*([+-]?\d{1,2})(?::?(\d{2}))?$/.exec(normalized);
  if (offsetMatch) {
    const sign = offsetMatch[1]!.startsWith("-") ? -1 : 1;
    const hours = Math.abs(Number.parseInt(offsetMatch[1]!, 10));
    const minutes = offsetMatch[2] ? Number.parseInt(offsetMatch[2], 10) : 0;
    // A bare "2" (no explicit sign) matches either +2 or -2 — the user
    // hasn't told us which side of UTC they mean.
    const candidates = offsetMatch[1]!.startsWith("+") || offsetMatch[1]!.startsWith("-")
      ? [sign * (hours * 60 + minutes)]
      : [hours * 60 + minutes, -(hours * 60 + minutes)];
    if (candidates.includes(option.offsetMinutes)) return true;
  }

  return false;
}

export function searchTimezoneOptions(options: TimezoneOption[], query: string): TimezoneOption[] {
  return options.filter((option) => timezoneOptionMatchesQuery(option, query));
}
