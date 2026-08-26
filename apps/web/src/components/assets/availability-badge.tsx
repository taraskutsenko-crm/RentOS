"use client";

import { AlertTriangle, Ban, MapPin, Search, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";

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

/**
 * Renders "why is this asset unavailable" as icon + text + dates — never
 * color alone, per the product requirement that a reserved/blocked asset
 * stays visible in every selector with its specific reason. Used by the
 * Rental/Quote wizard asset selectors, the Asset detail Availability
 * section, and the Availability Calendar, so the wording is identical
 * everywhere a staff member sees it.
 */
export function AvailabilityBadge({
  badge,
  locale,
}: {
  badge: AvailabilityBadgeInfo;
  locale: string;
}) {
  const { t } = useTranslation();
  const Icon = AVAILABILITY_BADGE_ICONS[badge.kind];
  const dateRange =
    badge.startAt && badge.endAt
      ? `${formatDate(badge.startAt, locale)} – ${formatDate(badge.endAt, locale)}`
      : null;

  return (
    <span className="text-warning-foreground bg-warning/15 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium">
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{t(badge.labelKey)}</span>
      {dateRange && <span className="text-muted-foreground">· {dateRange}</span>}
      {badge.reference && <span className="text-muted-foreground">· {badge.reference}</span>}
    </span>
  );
}
