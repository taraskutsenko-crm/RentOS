"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Clock } from "lucide-react";

import { cn } from "../lib/utils";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Every 15-minute slot in a day, "00:00".."23:45" — see docs/UI_PATTERNS.md "Time pickers". */
const QUARTER_HOUR_OPTIONS: string[] = Array.from({ length: 24 * 4 }, (_, index) => {
  const hours = Math.floor(index / 4);
  const minutes = (index % 4) * 15;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
});

function formatDisplayTime(value: string, locale: string): string {
  const match = TIME_PATTERN.exec(value);
  if (!match) return value;
  const reference = new Date(Date.UTC(2000, 0, 1, Number(match[1]), Number(match[2])));
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(reference);
}

export interface TimePickerProps {
  id?: string | undefined;
  /** "HH:mm" (24h, zero-padded), or "" for no time selected. */
  value: string;
  onChange: (value: string) => void;
  locale?: string | undefined;
  disabled?: boolean | undefined;
  "aria-label"?: string | undefined;
  "aria-invalid"?: boolean | undefined;
}

/**
 * A picker over 15-minute-interval time slots — per docs/UI_PATTERNS.md
 * "Time pickers" — with a free-text fallback for a precise value not on
 * the 15-minute grid (e.g. a delivery slot agreed at 09:10). Selecting
 * from the list is the primary interaction; typing is only the escape
 * hatch, never the only way to set a value, so precise entry is possible
 * without making manual typing the primary UX (the task's explicit
 * requirement).
 */
export function TimePicker({
  id,
  value,
  onChange,
  locale = "en",
  disabled,
  ...ariaProps
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  function commitDraft(next: string) {
    if (TIME_PATTERN.test(next)) {
      onChange(next);
    }
  }

  const options = React.useMemo(() => {
    if (!draft || QUARTER_HOUR_OPTIONS.includes(draft)) return QUARTER_HOUR_OPTIONS;
    if (!TIME_PATTERN.test(draft)) return QUARTER_HOUR_OPTIONS;
    // A precise, off-grid value stays visible and selectable in the list
    // rather than disappearing once it doesn't match a 15-minute slot.
    return [...QUARTER_HOUR_OPTIONS, draft].sort();
  }, [draft]);

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (disabled) return;
        setOpen(next);
        if (!next) commitDraft(draft);
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
          <Clock className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
          <span className={value ? undefined : "text-muted-foreground"}>
            {value ? formatDisplayTime(value, locale) : ""}
          </span>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className="bg-popover text-popover-foreground shadow-popover border-border havelio-pop z-dropdown flex w-48 flex-col gap-2 rounded-md border p-2"
        >
          <input
            type="text"
            inputMode="numeric"
            placeholder="HH:MM"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitDraft(draft);
                setOpen(false);
              }
            }}
            aria-label="Precise time (HH:MM)"
            className="border-input h-8 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          />
          <div ref={listRef} role="listbox" className="max-h-56 overflow-y-auto">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={option === value}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm outline-none",
                  "hover:bg-neutral-50 dark:hover:bg-neutral-800",
                  option === value && "bg-primary-light text-primary font-medium",
                )}
              >
                <span>{option}</span>
                <span className="text-muted-foreground text-xs">
                  {formatDisplayTime(option, locale)}
                </span>
              </button>
            ))}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
