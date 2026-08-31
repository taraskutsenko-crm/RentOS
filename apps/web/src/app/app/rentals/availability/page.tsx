"use client";

import { Button, Card, CardContent, Input } from "@rentos/ui";
import { tenantLocalToUtc, utcToTenantLocal } from "@rentos/shared";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAssets } from "../../../../hooks/use-assets";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { useTenantTimezone } from "../../../../hooks/use-current-tenant-role";
import { useAvailability } from "../../../../hooks/use-rentals";
import { AVAILABILITY_BADGE_ICONS } from "../../../../components/assets/availability-badge";
import { pickAvailabilityBadgeForDay } from "../../../../lib/asset-availability-badge";
import { formatDate } from "../../../../lib/date-format";
import { getAssetDisplayLabel } from "../../../../lib/asset-display-label";

/**
 * The calendar is browsed and rendered as tenant-local calendar months/days
 * — never UTC, never the viewer's browser timezone (see docs/DECISIONS.md
 * D-115/D-116). `{ year, month }` (month is 0-based, JS convention) is a
 * pure calendar coordinate with no instant attached, so navigating between
 * months is plain integer arithmetic, immune to any timezone concern.
 * Real UTC instants are only derived from it at the two points that
 * actually need one: the availability query window, and each day cell's
 * tenant-local midnight (for matching against AvailabilityService's
 * real-instant conflict/block windows) — both via the canonical
 * `tenantLocalToUtc` conversion, never hand-rolled offset math.
 */
interface MonthCursor {
  year: number;
  month: number;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function addMonthsCursor(cursor: MonthCursor, delta: number): MonthCursor {
  const total = cursor.year * 12 + cursor.month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** Pure calendar arithmetic (proleptic Gregorian) — never a real instant, so UTC-anchored Date is a safe calculator here. */
function daysInMonthCount(cursor: MonthCursor): number {
  return new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
}

function formatMonthLabel(cursor: MonthCursor, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(cursor.year, cursor.month, 1)));
}

/** The tenant-local UTC instant for a given calendar month's start (day 1, 00:00 tenant-local), or null while the timezone is still loading or on the (extremely rare) DST-gap-at-midnight edge case. */
function monthStartInstant(cursor: MonthCursor, timezone: string | undefined): Date | null {
  if (!timezone) return null;
  try {
    return tenantLocalToUtc(`${cursor.year}-${pad2(cursor.month + 1)}-01T00:00`, timezone);
  } catch {
    return null;
  }
}

interface CalendarDay {
  dayOfMonth: number;
  /** Tenant-local midnight of this day, as a real UTC instant — null on the DST-gap edge case, in which case the day is still shown but never matched against a conflict. */
  instant: Date | null;
}

function calendarDays(cursor: MonthCursor, timezone: string | undefined): CalendarDay[] {
  const count = daysInMonthCount(cursor);
  const days: CalendarDay[] = [];
  for (let day = 1; day <= count; day += 1) {
    days.push({ dayOfMonth: day, instant: null });
  }
  if (!timezone) return days;
  return days.map(({ dayOfMonth }) => {
    try {
      return {
        dayOfMonth,
        instant: tenantLocalToUtc(
          `${cursor.year}-${pad2(cursor.month + 1)}-${pad2(dayOfMonth)}T00:00`,
          timezone,
        ),
      };
    } catch {
      return { dayOfMonth, instant: null };
    }
  });
}

export default function AvailabilityCalendarPage() {
  const { t, i18n } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const timeZone = useTenantTimezone();
  const [assetSearch, setAssetSearch] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  // A reasonable browser-local guess up front (the exact initial month is a
  // coarse UX default, not a correctness-critical value) — resynced to the
  // tenant's real "today" below the moment the real timezone loads.
  const [monthCursor, setMonthCursor] = useState<MonthCursor>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const appliedInitialTenantMonth = useRef(false);
  useEffect(() => {
    if (appliedInitialTenantMonth.current || !timeZone) return;
    const [year, month] = utcToTenantLocal(new Date(), timeZone).split("-");
    setMonthCursor({ year: Number(year), month: Number(month) - 1 });
    appliedInitialTenantMonth.current = true;
  }, [timeZone]);

  const { data: assetsData } = useAssets(tenantId, {
    search: assetSearch || undefined,
    pageSize: 20,
  });

  const monthStart = monthStartInstant(monthCursor, timeZone);
  const monthEnd = monthStartInstant(addMonthsCursor(monthCursor, 1), timeZone);
  const { data: availability } = useAvailability(
    tenantId,
    selectedAssetIds.length > 0 && monthStart && monthEnd
      ? {
          assetIds: selectedAssetIds,
          plannedStart: monthStart.toISOString(),
          plannedEnd: monthEnd.toISOString(),
        }
      : null,
  );

  const days = useMemo(() => calendarDays(monthCursor, timeZone), [monthCursor, timeZone]);

  function toggleAsset(assetId: string): void {
    setSelectedAssetIds((current) =>
      current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId],
    );
  }

  function dayBadge(assetId: string, day: CalendarDay) {
    if (!day.instant) return null;
    const result = availability?.results.find((entry) => entry.assetId === assetId);
    return pickAvailabilityBadgeForDay(result, day.instant);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("rental.availabilityCalendar.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("rental.availabilityCalendar.subtitle")}</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <Input
            placeholder={t("asset.searchPlaceholder")}
            value={assetSearch}
            onChange={(event) => setAssetSearch(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {assetsData?.items.map((asset) => (
              <label
                key={asset.id}
                className={`cursor-pointer rounded-md border px-2 py-1 text-sm ${selectedAssetIds.includes(asset.id) ? "border-primary bg-primary/10" : ""}`}
              >
                <input
                  type="checkbox"
                  className="mr-1"
                  checked={selectedAssetIds.includes(asset.id)}
                  onChange={() => toggleAsset(asset.id)}
                />
                {getAssetDisplayLabel(asset)}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMonthCursor((current) => addMonthsCursor(current, -1))}
        >
          {t("rental.availabilityCalendar.previousMonth")}
        </Button>
        <span className="text-sm font-medium">{formatMonthLabel(monthCursor, i18n.language)}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMonthCursor((current) => addMonthsCursor(current, 1))}
        >
          {t("rental.availabilityCalendar.nextMonth")}
        </Button>
      </div>

      {selectedAssetIds.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {t("rental.availabilityCalendar.selectAssetsHint")}
        </p>
      )}

      <div className="flex flex-col gap-6">
        {selectedAssetIds.map((assetId) => {
          const asset = assetsData?.items.find((entry) => entry.id === assetId);
          return (
            <Card key={assetId}>
              <CardContent className="p-4">
                <p className="mb-2 font-medium">{asset?.name ?? assetId}</p>
                <div className="grid grid-cols-7 gap-1">
                  {days.map((day) => {
                    const badge = dayBadge(assetId, day);
                    const dateRange =
                      badge?.startAt && badge.endAt
                        ? `${formatDate(badge.startAt, i18n.language, timeZone)} – ${formatDate(badge.endAt, i18n.language, timeZone)}`
                        : null;
                    const title = badge
                      ? [t(badge.labelKey), dateRange, badge.reference].filter(Boolean).join(" · ")
                      : t("rental.availabilityCalendar.free");
                    const href = badge?.rentalId
                      ? `/app/rentals/${badge.rentalId}`
                      : badge
                        ? `/app/assets/${assetId}`
                        : null;
                    const cellClassName = `flex h-10 flex-col items-center justify-center gap-0.5 rounded text-xs ${badge ? "bg-warning/15 text-warning-foreground" : "bg-primary/10"}`;
                    const Icon = badge ? AVAILABILITY_BADGE_ICONS[badge.kind] : null;
                    const content = (
                      <>
                        <span>{day.dayOfMonth}</span>
                        {Icon && <Icon className="size-3" aria-hidden="true" />}
                      </>
                    );
                    const key = `${monthCursor.year}-${monthCursor.month}-${day.dayOfMonth}`;
                    return href ? (
                      <Link
                        key={key}
                        href={href}
                        title={title}
                        className={`${cellClassName} hover:opacity-80`}
                      >
                        {content}
                      </Link>
                    ) : (
                      <div key={key} title={title} className={cellClassName}>
                        {content}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
