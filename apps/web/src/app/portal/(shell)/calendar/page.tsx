"use client";

import { Button, Card, CardContent } from "@rentos/ui";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { usePortalRentals } from "../../../../hooks/use-portal-rentals";
import type { PortalRentalListItem } from "../../../../types/portal";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildMonthGrid(monthStart: Date): Date[] {
  const firstWeekday = (monthStart.getDay() + 6) % 7; // Monday = 0
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - firstWeekday);

  const days: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    days.push(day);
  }
  return days;
}

function overlapsDay(rental: PortalRentalListItem, day: Date): boolean {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const start = new Date(rental.plannedStart);
  const end = new Date(rental.plannedEnd);
  return start < dayEnd && end >= dayStart;
}

export default function PortalCalendarPage() {
  const { t } = useTranslation();
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const { data, isLoading } = usePortalRentals({ pageSize: 100 });

  const days = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);
  const rentals = data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("portal.calendar.title")}</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setMonthCursor(
                (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
              )
            }
          >
            ←
          </Button>
          <span className="min-w-32 text-center text-sm font-medium">
            {monthCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setMonthCursor(
                (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
              )
            }
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
              {days.map((day) => {
                const inMonth = day.getMonth() === monthCursor.getMonth();
                const dayRentals = rentals.filter((rental) => overlapsDay(rental, day));
                return (
                  <div
                    key={day.toISOString()}
                    className={`min-h-24 border p-1.5 text-xs ${inMonth ? "" : "bg-muted/40 text-muted-foreground"}`}
                  >
                    <p className="mb-1 font-medium">{day.getDate()}</p>
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
