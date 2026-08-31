"use client";

import { Button, Card, CardContent } from "@rentos/ui";
import { tenantLocalToUtc, utcToTenantLocal } from "@rentos/shared";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { usePortalMe } from "../../../../hooks/use-portal-auth";
import { usePortalRentals } from "../../../../hooks/use-portal-rentals";
import type { PortalRentalListItem } from "../../../../types/portal";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Same tenant-local calendar coordinate as the staff Availability Calendar
 * (`apps/web/src/app/app/rentals/availability/page.tsx`, see
 * docs/DECISIONS.md D-116) — a customer must see their own rental schedule
 * laid out on the company's calendar, never shifted by their own browser's
 * timezone.
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

/** Pure calendar arithmetic (proleptic Gregorian) — never a real instant. */
function daysInMonthCount(cursor: MonthCursor): number {
  return new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
}

/** Monday-first weekday index (0-6) for the 1st of the month — pure calendar math, no timezone involved. */
function firstWeekdayIndex(cursor: MonthCursor): number {
  return (new Date(Date.UTC(cursor.year, cursor.month, 1)).getUTCDay() + 6) % 7;
}

/**
 * Adds `delta` calendar days to a (year, 0-based month, day) tuple,
 * correctly rolling over month/year boundaries (e.g. Aug 31 + 1 day → Sep
 * 1) — pure calendar arithmetic (proleptic Gregorian, relying on the same
 * JS `Date.UTC` overflow behavior `daysInMonthCount` already uses), never a
 * real instant. Naively incrementing just the day-of-month digit (without
 * this) produces an invalid date — e.g. "2026-08-32" — on the last day of
 * any month.
 */
function addCalendarDays(
  year: number,
  month: number,
  day: number,
  delta: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month, day + delta));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

function formatMonthLabel(cursor: MonthCursor, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(cursor.year, cursor.month, 1)));
}

interface CalendarCell {
  /** Calendar-only "which day is this" coordinate, independent of any instant. */
  year: number;
  month: number;
  dayOfMonth: number;
  inMonth: boolean;
  /** Tenant-local midnight of this day and the next, as real UTC instants — null while the timezone is still loading or on the (extremely rare) DST-gap-at-midnight edge case. */
  dayStart: Date | null;
  dayEnd: Date | null;
}

function buildMonthGrid(cursor: MonthCursor, timezone: string | undefined): CalendarCell[] {
  const daysBefore = firstWeekdayIndex(cursor);
  const prevMonth = addMonthsCursor(cursor, -1);
  const prevMonthLength = daysInMonthCount(prevMonth);
  const thisMonthLength = daysInMonthCount(cursor);

  const cells: { year: number; month: number; dayOfMonth: number; inMonth: boolean }[] = [];
  for (let i = daysBefore - 1; i >= 0; i -= 1) {
    cells.push({
      year: prevMonth.year,
      month: prevMonth.month,
      dayOfMonth: prevMonthLength - i,
      inMonth: false,
    });
  }
  for (let day = 1; day <= thisMonthLength; day += 1) {
    cells.push({ year: cursor.year, month: cursor.month, dayOfMonth: day, inMonth: true });
  }
  const nextMonth = addMonthsCursor(cursor, 1);
  let nextDay = 1;
  while (cells.length < 42) {
    cells.push({
      year: nextMonth.year,
      month: nextMonth.month,
      dayOfMonth: nextDay,
      inMonth: false,
    });
    nextDay += 1;
  }

  return cells.map((cell) => {
    if (!timezone) return { ...cell, dayStart: null, dayEnd: null };
    try {
      const dayStart = tenantLocalToUtc(
        `${cell.year}-${pad2(cell.month + 1)}-${pad2(cell.dayOfMonth)}T00:00`,
        timezone,
      );
      const next = addCalendarDays(cell.year, cell.month, cell.dayOfMonth, 1);
      const dayEnd = tenantLocalToUtc(
        `${next.year}-${pad2(next.month + 1)}-${pad2(next.day)}T00:00`,
        timezone,
      );
      return { ...cell, dayStart, dayEnd };
    } catch {
      return { ...cell, dayStart: null, dayEnd: null };
    }
  });
}

function overlapsDay(rental: PortalRentalListItem, cell: CalendarCell): boolean {
  if (!cell.dayStart || !cell.dayEnd) return false;
  const start = new Date(rental.plannedStart);
  const end = new Date(rental.plannedEnd);
  return start < cell.dayEnd && end >= cell.dayStart;
}

export default function PortalCalendarPage() {
  const { t, i18n } = useTranslation();
  const { data: me } = usePortalMe();
  const timeZone = me?.tenant?.timezone;
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

  const { data, isLoading } = usePortalRentals({ pageSize: 100 });

  const days = useMemo(() => buildMonthGrid(monthCursor, timeZone), [monthCursor, timeZone]);
  const rentals = data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("portal.calendar.title")}</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMonthCursor((current) => addMonthsCursor(current, -1))}
          >
            ←
          </Button>
          <span className="min-w-32 text-center text-sm font-medium">
            {formatMonthLabel(monthCursor, i18n.language)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMonthCursor((current) => addMonthsCursor(current, 1))}
          >
            →
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">{t("common.loading")}</p>}

      {!isLoading && (
        <Card>
          <CardContent className="p-3">
            <div className="grid grid-cols-7 gap-px text-center text-xs font-medium">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="text-muted-foreground p-2">
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px">
              {days.map((cell) => {
                const dayRentals = rentals.filter((rental) => overlapsDay(rental, cell));
                return (
                  <div
                    key={`${cell.year}-${cell.month}-${cell.dayOfMonth}`}
                    className={`min-h-24 border p-1.5 text-xs ${cell.inMonth ? "" : "bg-muted/40 text-muted-foreground"}`}
                  >
                    <p className="mb-1 font-medium">{cell.dayOfMonth}</p>
                    <div className="flex flex-col gap-1">
                      {dayRentals.map((rental) => (
                        <Link
                          key={rental.id}
                          href={`/portal/rentals/${rental.id}`}
                          className="bg-secondary text-secondary-foreground block truncate rounded px-1.5 py-0.5"
                          title={rental.rentalNumber}
                        >
                          {rental.rentalNumber}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && rentals.length === 0 && (
        <p className="text-muted-foreground text-sm">{t("portal.calendar.empty")}</p>
      )}
    </div>
  );
}
