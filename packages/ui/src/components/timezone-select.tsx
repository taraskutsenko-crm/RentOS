"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronsUpDown, Globe, Search } from "lucide-react";

import { cn } from "../lib/utils";

/**
 * Structurally compatible with `@rentos/shared`'s `TimezoneOption` — this
 * package has no dependency on `@rentos/shared` (it stays a pure,
 * data-agnostic component library, same as DatePicker/TimePicker), so the
 * shape is declared here and the caller's real option objects just
 * satisfy it via structural typing.
 */
export interface TimezoneSelectOption {
  /** Canonical IANA identifier — the only value this component ever emits via onChange. */
  value: string;
  /** Human-readable city/region label, e.g. "Warsaw". */
  label: string;
  /** "+02:00" — shown as small secondary text next to the label. */
  offsetLabel: string;
  /** "UTC+02:00 — Warsaw" — the full row/trigger text. */
  displayLabel: string;
}

export interface TimezoneSelectGroup {
  /** "UTC+02:00" / "UTC±00:00" — rendered as a sticky-ish group header. */
  groupLabel: string;
  options: TimezoneSelectOption[];
}

export interface TimezoneSelectLabels {
  /** Shown in the trigger when nothing is selected. */
  placeholder?: string;
  /** Placeholder text for the search input. */
  searchPlaceholder?: string;
  /** Shown when the current search matches nothing. */
  noResults?: string;
}

export interface TimezoneSelectProps {
  id?: string | undefined;
  /** The selected IANA identifier — never a numeric offset (see @rentos/shared timezone-options.ts). */
  value: string;
  onChange: (value: string) => void;
  /**
   * Already filtered (by `search`) and grouped-by-offset options to render
   * — this component does no timezone math or matching itself, so the
   * one real implementation of "what UTC+2 means right now" and "does
   * this query match Warsaw" lives once, in @rentos/shared, not
   * duplicated into the UI layer.
   */
  groups: TimezoneSelectGroup[];
  search: string;
  onSearchChange: (query: string) => void;
  /** The selected option's own displayLabel/offsetLabel, when known — lets the trigger show a friendly label even while the popover (and its filtered `groups`) is closed or mid-search. Falls back to the raw `value`. */
  selectedOption?: TimezoneSelectOption | undefined;
  labels?: TimezoneSelectLabels | undefined;
  disabled?: boolean | undefined;
  "aria-label"?: string | undefined;
  "aria-invalid"?: boolean | undefined;
}

/**
 * A searchable, offset-grouped timezone combobox per docs/UI_PATTERNS.md
 * (Time Zone selector) — replaces a raw native `<select>` of ~400 IANA ids
 * with a Havelio-styled popover: type to search (city, country alias, raw
 * IANA id, or a "+2"/"UTC+2" offset shape — matching handled by the
 * caller), arrow keys to move, Enter to choose. Always emits the real IANA
 * identifier; the offset/city text is presentation only.
 */
export function TimezoneSelect({
  id,
  value,
  onChange,
  groups,
  search,
  onSearchChange,
  selectedOption,
  labels,
  disabled,
  ...ariaProps
}: TimezoneSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState<string | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const flatValues = React.useMemo(
    () => groups.flatMap((group) => group.options.map((option) => option.value)),
    [groups],
  );

  React.useEffect(() => {
    if (!open) return;
    // Re-anchor the highlight whenever the filtered set changes (typing
    // narrows/widens `groups`) — keep the current selection highlighted if
    // still visible, otherwise fall back to the first visible option.
    setHighlighted((current) =>
      current && flatValues.includes(current) ? current : (flatValues[0] ?? null),
    );
  }, [open, flatValues]);

  function selectValue(next: string): void {
    onChange(next);
    setOpen(false);
  }

  function moveHighlight(delta: number): void {
    if (flatValues.length === 0) return;
    const currentIndex = highlighted ? flatValues.indexOf(highlighted) : -1;
    const nextIndex =
      currentIndex === -1
        ? delta > 0
          ? 0
          : flatValues.length - 1
        : (currentIndex + delta + flatValues.length) % flatValues.length;
    const nextValue = flatValues[nextIndex]!;
    setHighlighted(nextValue);
    listRef.current
      ?.querySelector<HTMLElement>(`[data-tz-option="${CSS.escape(nextValue)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }

  const triggerText = selectedOption?.displayLabel ?? (value || undefined);

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (disabled) return;
        setOpen(next);
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          aria-label={ariaProps["aria-label"]}
          aria-invalid={ariaProps["aria-invalid"]}
          className={cn(
            "border-input flex h-9 w-full items-center gap-2 rounded-md border bg-transparent px-3 text-left text-sm shadow-xs transition-[color,box-shadow] outline-none",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <Globe className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
          <span className={cn("flex-1 truncate", !triggerText && "text-muted-foreground")}>
            {triggerText ?? labels?.placeholder ?? ""}
          </span>
          {selectedOption?.value && (
            <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
              {selectedOption.value}
            </span>
          )}
          <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className="bg-popover text-popover-foreground shadow-popover border-border havelio-pop z-dropdown flex w-80 flex-col rounded-md border p-0"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchInputRef.current?.focus();
          }}
        >
          <div className="border-border flex items-center gap-2 border-b px-3 py-2">
            <Search className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              role="searchbox"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={labels?.searchPlaceholder}
              className="placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
              onKeyDown={(event) => {
                switch (event.key) {
                  case "ArrowDown":
                    event.preventDefault();
                    moveHighlight(1);
                    break;
                  case "ArrowUp":
                    event.preventDefault();
                    moveHighlight(-1);
                    break;
                  case "Enter":
                    event.preventDefault();
                    if (highlighted) selectValue(highlighted);
                    break;
                  case "Escape":
                    setOpen(false);
                    break;
                  default:
                    break;
                }
              }}
            />
          </div>
          <div ref={listRef} role="listbox" className="max-h-72 overflow-y-auto p-1">
            {groups.length === 0 && (
              <p className="text-muted-foreground px-3 py-4 text-center text-sm">
                {labels?.noResults}
              </p>
            )}
            {groups.map((group) => (
              <div key={group.groupLabel}>
                <div className="text-muted-foreground px-2 pt-2 pb-1 text-xs font-semibold">
                  {group.groupLabel}
                </div>
                {group.options.map((option) => {
                  const isSelected = option.value === value;
                  const isHighlighted = option.value === highlighted;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      data-tz-option={option.value}
                      onMouseEnter={() => setHighlighted(option.value)}
                      onClick={() => selectValue(option.value)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none",
                        isHighlighted && "bg-accent text-accent-foreground",
                      )}
                    >
                      <Check
                        className={cn("size-3.5 shrink-0", isSelected ? "opacity-100" : "opacity-0")}
                        aria-hidden="true"
                      />
                      <span className="flex-1 truncate">{option.label}</span>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {option.offsetLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
