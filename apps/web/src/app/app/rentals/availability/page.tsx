"use client";

import { Button, Card, CardContent, Input } from "@rentos/ui";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAssets } from "../../../../hooks/use-assets";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { useAvailability } from "../../../../hooks/use-rentals";
import { AVAILABILITY_BADGE_ICONS } from "../../../../components/assets/availability-badge";
import { pickAvailabilityBadgeForDay } from "../../../../lib/asset-availability-badge";
import { getAssetDisplayLabel } from "../../../../lib/asset-display-label";

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date: Date, count: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
}

function daysInMonth(date: Date): Date[] {
  const first = startOfMonth(date);
  const days: Date[] = [];
  for (let day = 1; day <= 31; day += 1) {
    const candidate = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), day));
    if (candidate.getUTCMonth() !== first.getUTCMonth()) break;
    days.push(candidate);
  }
  return days;
}

export default function AvailabilityCalendarPage() {
  const { t, i18n } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const [assetSearch, setAssetSearch] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));

  const { data: assetsData } = useAssets(tenantId, {
    search: assetSearch || undefined,
    pageSize: 20,
  });
  const monthStart = monthCursor;
  const monthEnd = addMonths(monthCursor, 1);
  const { data: availability } = useAvailability(
    tenantId,
    selectedAssetIds.length > 0
      ? {
          assetIds: selectedAssetIds,
          plannedStart: monthStart.toISOString(),
          plannedEnd: monthEnd.toISOString(),
        }
      : null,
  );

  const days = useMemo(() => daysInMonth(monthCursor), [monthCursor]);

  function toggleAsset(assetId: string): void {
    setSelectedAssetIds((current) =>
      current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId],
    );
  }

  function dayBadge(assetId: string, day: Date) {
    const result = availability?.results.find((entry) => entry.assetId === assetId);
    return pickAvailabilityBadgeForDay(result, day);
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
          onClick={() => setMonthCursor((current) => addMonths(current, -1))}
        >
          {t("rental.availabilityCalendar.previousMonth")}
        </Button>
        <span className="text-sm font-medium">
          {monthCursor.toLocaleDateString(i18n.language, {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMonthCursor((current) => addMonths(current, 1))}
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
                        ? `${new Date(badge.startAt).toLocaleDateString(i18n.language)} – ${new Date(badge.endAt).toLocaleDateString(i18n.language)}`
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
                        <span>{day.getUTCDate()}</span>
                        {Icon && <Icon className="size-3" aria-hidden="true" />}
                      </>
                    );
                    return href ? (
                      <Link
                        key={day.toISOString()}
                        href={href}
                        title={title}
                        className={`${cellClassName} hover:opacity-80`}
                      >
                        {content}
                      </Link>
                    ) : (
                      <div key={day.toISOString()} title={title} className={cellClassName}>
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
