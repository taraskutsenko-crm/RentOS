"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "../lib/utils";

const WEEKDAY_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const MONTH_YEAR_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const DAY_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getWeekdayFormatter(locale: string): Intl.DateTimeFormat {
  let formatter = WEEKDAY_FORMATTER_CACHE.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
    WEEKDAY_FORMATTER_CACHE.set(locale, formatter);
  }
  return formatter;
}

function getMonthYearFormatter(locale: string): Intl.DateTimeFormat {
  let formatter = MONTH_YEAR_FORMATTER_CACHE.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    MONTH_YEAR_FORMATTER_CACHE.set(locale, formatter);
  }
  return formatter;
}

function getDayFormatter(locale: string): Intl.DateTimeFormat {
  let formatter = DAY_FORMATTER_CACHE.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    DAY_FORMATTER_CACHE.set(locale, formatter);
  }
  return formatter;
}

/** Parses a "YYYY-MM-DD" string as a UTC midnight Date, or null if empty/invalid. */
function parseIsoDate(value: string): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isSameDay(a: Date, b: Date): boolean {
  return toIsoDate(a) === toIsoDate(b);
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

/**
 * The 6x7 grid of Dates to render for the month containing `monthAnchor`,
 * beginning on the Monday on/before the 1st (ISO week start) and always
 * exactly 42 cells so the grid height never jumps between months.
 */
function buildMonthGrid(monthAnchor: Date): Date[] {
  const first = startOfMonth(monthAnchor);
  const firstWeekday = first.getUTCDay(); // 0=Sun..6=Sat
  const offset = (firstWeekday + 6) % 7; // days since the preceding Monday
  const gridStart = new Date(first);
  gridStart.setUTCDate(gridStart.getUTCDate() - offset);

  const days: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(gridStart);
    day.setUTCDate(gridStart.getUTCDate() + i);
    days.push(day);
  }
  return days;
}

export interface DatePickerProps {
  id?: string | undefined;
  /** ISO "YYYY-MM-DD", or "" for no date selected. */
  value: string;
  onChange: (value: string) => void;
  locale?: string | undefined;
  disabled?: boolean | undefined;
  placeholder?: string | undefined;
  /** ISO "YYYY-MM-DD" — dates strictly before this are shown disabled/unselectable. */
  min?: string | undefined;
  "aria-label"?: string | undefined;
  "aria-invalid"?: boolean | undefined;
}

/**
 * A calendar-grid date picker per docs/UI_PATTERNS.md "Date pickers" —
 * dates are always picked, never typed freely, so the resulting value is
 * always a parseable, locale-independent ISO date. Single-date only (no
 * range mode — every current use case, Rental/Quote planned start/end, is
 * two independent single-date pickers, per docs/UI_PATTERNS.md's own
 * two-single-pickers pattern for a period rather than one range picker).
 */
export function DatePicker({
  id,
  value,
  onChange,
  locale = "en",
  disabled,
  placeholder,
  min,
  ...ariaProps
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = React.useMemo(() => parseIsoDate(value), [value]);
  const minDate = React.useMemo(() => parseIsoDate(min ?? ""), [min]);
  const today = React.useMemo(() => parseIsoDate(toIsoDate(new Date())), []);
  const [viewedMonth, setViewedMonth] = React.useState(() =>
    startOfMonth(selected ?? today ?? new Date()),
  );
  const gridRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open) setViewedMonth(startOfMonth(selected ?? today ?? new Date()));
  }, [open, selected, today]);

  const days = React.useMemo(() => buildMonthGrid(viewedMonth), [viewedMonth]);
  const weekdayLabels = React.useMemo(() => {
    const formatter = getWeekdayFormatter(locale);
    return days.slice(0, 7).map((day) => formatter.format(day));
  }, [days, locale]);

  function selectDay(day: Date) {
    if (minDate && day < minDate) return;
    onChange(toIsoDate(day));
    setOpen(false);
  }

  function moveFocus(fromIndex: number, deltaDays: number) {
    const cells = gridRef.current?.querySelectorAll<HTMLButtonElement>("[data-day-cell]");
    if (!cells) return;
    let targetIndex = fromIndex + deltaDays;
    if (targetIndex < 0 || targetIndex >= days.length) {
      // Crossed into an adjacent month — shift the view and keep going.
      setViewedMonth((current) => addMonths(current, deltaDays < 0 ? -1 : 1));
      return;
    }
    cells[targetIndex]?.focus();
  }

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!disabled) setOpen(next);
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-label={ariaProps["aria-label"]}
          aria-invalid={ariaProps["aria-invalid"]}
          className={cn(
            "border-input flex h-9 w-full items-center gap-2 rounded-md border bg-transparent px-3 text-left text-sm shadow-xs transition-[color,box-shadow] outline-none",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <CalendarIcon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
          <span className={selected ? undefined : "text-muted-foreground"}>
            {selected ? getDayFormatter(locale).format(selected) : (placeholder ?? "")}
          </span>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className="bg-popover text-popover-foreground shadow-popover border-border havelio-pop z-dropdown w-72 rounded-md border p-3"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            gridRef.current
              ?.querySelector<HTMLButtonElement>('[data-day-cell][tabindex="0"]')
              ?.focus();
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewedMonth((current) => addMonths(current, -1))}
              className="hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-md p-1"
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <span className="text-sm font-medium">
              {getMonthYearFormatter(locale).format(viewedMonth)}
            </span>
            <button
              type="button"
              onClick={() => setViewedMonth((current) => addMonths(current, 1))}
              className="hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-md p-1"
              aria-label="Next month"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div ref={gridRef} role="grid" className="grid grid-cols-7 gap-0.5">
            {weekdayLabels.map((label, index) => (
              <div
                key={index}
                className="text-muted-foreground py-1 text-center text-xs font-medium"
                aria-hidden="true"
              >
                {label}
              </div>
            ))}
            {days.map((day, index) => {
              const inMonth = day.getUTCMonth() === viewedMonth.getUTCMonth();
              const isSelected = selected ? isSameDay(day, selected) : false;
              const isToday = today ? isSameDay(day, today) : false;
              const isDisabled = minDate ? day < minDate : false;
              // Roving tabindex: only the selected day (or today, or the
              // 1st) is a normal tab stop — arrow keys move focus within
              // the grid without adding 42 stops to the page's tab order.
              const isRovingTarget = isSelected || (!selected && isToday) || day.getUTCDate() === 1;
              return (
                <button
                  key={index}
                  type="button"
                  data-day-cell
                  role="gridcell"
                  tabIndex={isRovingTarget ? 0 : -1}
                  disabled={isDisabled}
                  aria-selected={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  onClick={() => selectDay(day)}
                  onKeyDown={(event) => {
                    switch (event.key) {
                      case "ArrowRight":
                        event.preventDefault();
                        moveFocus(index, 1);
                        break;
                      case "ArrowLeft":
                        event.preventDefault();
                        moveFocus(index, -1);
                        break;
                      case "ArrowDown":
                        event.preventDefault();
                        moveFocus(index, 7);
                        break;
                      case "ArrowUp":
                        event.preventDefault();
                        moveFocus(index, -7);
                        break;
                      case "Enter":
                      case " ":
                        event.preventDefault();
                        selectDay(day);
                        break;
                      default:
                        break;
                    }
                  }}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-md text-sm outline-none",
                    "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                    !inMonth && "text-muted-foreground/50",
                    inMonth && !isSelected && "hover:bg-neutral-50 dark:hover:bg-neutral-800",
                    isSelected && "bg-primary text-primary-foreground font-medium",
                    isToday && !isSelected && "border-primary border",
                    isDisabled && "pointer-events-none opacity-40",
                  )}
                >
                  {day.getUTCDate()}
                </button>
              );
            })}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
