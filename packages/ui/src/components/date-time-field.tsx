"use client";

import * as React from "react";

import { DatePicker } from "./date-picker";
import { TimePicker } from "./time-picker";

function splitValue(value: string): { date: string; time: string } {
  const [date = "", time = ""] = value.split("T");
  return { date, time: time.slice(0, 5) };
}

export interface DateTimeFieldProps {
  id?: string | undefined;
  /**
   * The exact same "YYYY-MM-DDTHH:mm" shape the native
   * `<input type="datetime-local">` this field replaces already produced —
   * callers (react-hook-form, the API payload) need no changes at all.
   */
  value: string;
  onChange: (value: string) => void;
  locale?: string | undefined;
  disabled?: boolean | undefined;
  /** ISO "YYYY-MM-DD" — the date half is disabled before this day. */
  minDate?: string | undefined;
  "aria-invalid"?: boolean | undefined;
  dateLabel?: string | undefined;
  timeLabel?: string | undefined;
}

/**
 * Replaces the raw `<input type="datetime-local">` previously used for
 * Rental/Quote planned start/end (browser-native chrome with no dedicated
 * discoverable UI, typing as the primary interaction) with a proper Date
 * Picker (docs/UI_PATTERNS.md) + Time Picker (15-minute intervals + a
 * precise free-text fallback) pair. Deliberately a pure UI-layer swap: the
 * combined value is byte-identical to what the native input already
 * produced, so no DTO/service/date-semantics change was needed anywhere
 * downstream (see DECISIONS.md).
 */
export function DateTimeField({
  id,
  value,
  onChange,
  locale = "en",
  disabled,
  minDate,
  dateLabel,
  timeLabel,
  ...ariaProps
}: DateTimeFieldProps) {
  const { date, time } = splitValue(value);

  function handleDateChange(nextDate: string) {
    // A date picked with no time selected yet defaults to midnight rather
    // than leaving the field incomplete — matches how a native
    // datetime-local input always carries a complete value once touched.
    onChange(`${nextDate}T${time || "00:00"}`);
  }

  function handleTimeChange(nextTime: string) {
    if (!date) return; // nothing to combine with yet — TimePicker's own value stays uncommitted
    onChange(`${date}T${nextTime}`);
  }

  return (
    <div className="flex gap-2">
      <div className="min-w-0 flex-[3]">
        <DatePicker
          id={id}
          value={date}
          onChange={handleDateChange}
          locale={locale}
          disabled={disabled}
          min={minDate}
          aria-label={dateLabel}
          aria-invalid={ariaProps["aria-invalid"]}
        />
      </div>
      <div className="min-w-0 flex-[2]">
        <TimePicker
          value={time}
          onChange={handleTimeChange}
          locale={locale}
          disabled={disabled || !date}
          aria-label={timeLabel}
          aria-invalid={ariaProps["aria-invalid"]}
        />
      </div>
    </div>
  );
}
