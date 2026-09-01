"use client";

import { AlertTriangle, Ban, MapPin, Search, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@rentos/ui";

import type { AvailabilityBadgeInfo } from "../../lib/asset-availability-badge";
import { formatDate } from "../../lib/date-format";

export const AVAILABILITY_BADGE_ICONS: Record<AvailabilityBadgeInfo["kind"], typeof Wrench> = {
  RENTAL_CONFLICT: AlertTriangle,
  MAINTENANCE: Wrench,
  REPAIR: Wrench,
  INSPECTION: Search,
  RELOCATION: MapPin,
  MANUAL_BLOCK: Ban,
  LOST: Ban,
  RETIRED: Ban,
};

/** An overdue rental conflict and a permanently-lost/retired asset are the two "this is definitely, indefinitely blocked" cases — both get the stronger danger tone; every other reason (a still-on-track rental, a maintenance/repair/inspection/relocation/manual block) gets the ordinary warning tone. */
function toneFor(badge: AvailabilityBadgeInfo): "danger" | "warning" {
  if (badge.isOverdueConflict) return "danger";
  if (badge.kind === "LOST" || badge.kind === "RETIRED") return "danger";
  return "warning";
}

const TONE_CLASSES: Record<"danger" | "warning", string> = {
  danger: "bg-danger-light text-destructive border-destructive/30",
  warning: "bg-warning-light text-warning border-warning/30",
};

/**
 * Renders "why is this asset unavailable" as icon + text + dates — never
 * color alone, and never low-contrast/near-invisible text, per the product
 * requirement that a reserved/blocked asset stays visible AND READABLE in
 * every selector with its specific reason (previously `bg-warning/15` +
 * white text — a low-opacity fill under light-on-light text that was
 * effectively unreadable in light mode; see docs/DECISIONS.md). Uses the
 * same solid `bg-X-light text-X` + border idiom as `RentalStatusBadge`/
 * `RentalAttentionBadge` — a real WCAG-contrast-safe fill, not an alpha
 * blend. Used by the Rental/Quote wizard asset selectors, the Asset detail
 * Availability section, and the Availability Calendar, so the wording is
 * identical everywhere a staff member sees it.
 *
 * An overdue rental conflict never implies the asset becomes available once
 * `endAt` (the rental's plannedEnd) passes — see `isOverdueConflict`'s own
 * doc comment — so this renders "Planned return" instead of a date range in
 * that case, and never claims the asset frees up on a known date.
 */
export function AvailabilityBadge({
  badge,
  locale,
  timezone,
}: {
  badge: AvailabilityBadgeInfo;
  locale: string;
  /** The tenant's real timezone — badge.startAt/endAt are real instants, so displaying them without it would silently fall back to the viewer's own browser timezone (see docs/DECISIONS.md D-115). */
  timezone?: string | undefined;
}) {
  const { t } = useTranslation();
  const Icon = AVAILABILITY_BADGE_ICONS[badge.kind];
  const tone = toneFor(badge);

  const dateInfo = badge.isOverdueConflict
    ? badge.endAt
      ? t("asset.availability.plannedReturn", { date: formatDate(badge.endAt, locale, timezone) })
      : null
    : badge.startAt && badge.endAt
      ? `${formatDate(badge.startAt, locale, timezone)} – ${formatDate(badge.endAt, locale, timezone)}`
      : null;

  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
        TONE_CLASSES[tone],
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{t(badge.labelKey)}</span>
      {badge.reference && <span>· {badge.reference}</span>}
      {dateInfo && <span>· {dateInfo}</span>}
    </span>
  );
}
