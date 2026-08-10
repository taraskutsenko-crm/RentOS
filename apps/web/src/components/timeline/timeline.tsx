"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { Input } from "@rentos/ui";

import { formatDate, formatDateTime } from "../../lib/date-format";
import type { TimelineEventConfig } from "../../lib/timeline-registries";
import type { TimelineEvent } from "../../types/timeline";
import { DismissibleHint } from "../shell/dismissible-hint";

const TONE_CLASSES: Record<NonNullable<TimelineEventConfig["tone"]>, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

/** "Today"/"Yesterday" beat a bare date for anything recent — everything older groups by locale date. */
function groupKeyForDate(occurredAt: string, now: Date, locale: string): string {
  const date = new Date(occurredAt);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  return formatDate(date, locale);
}

/**
 * The one reusable Timeline every entity detail page renders — see
 * docs/PRODUCT_BIBLE.md §12 (Timeline First) and docs/UI_REDESIGN_PLAN.md
 * Chapter 6. Entirely driven by a per-entity TimelineEventConfig registry
 * (icon/label/tone) — this component never branches on entity type, so
 * adding a new entity's Timeline never requires touching this file (see
 * docs/UI_REDESIGN_PLAN.md Chapter 6, design decision 4). Search and
 * grouping are client-side only — one entity's lifecycle is always a small
 * list (design decision 5). Items with a related record navigate to it in
 * one click; items without one (e.g. a raw audit entry) render inert.
 */
export function Timeline<TType extends string>({
  events,
  registry,
  isLoading,
  emptyLabel,
  searchPlaceholder,
  getHref,
}: {
  events: TimelineEvent<TType>[] | undefined;
  registry: Record<TType, TimelineEventConfig>;
  isLoading?: boolean;
  emptyLabel: string;
  searchPlaceholder: string;
  getHref?: (event: TimelineEvent<TType>) => string | undefined;
}) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLOListElement>(null);

  const resolved = useMemo(
    () =>
      (events ?? []).map((event) => {
        const config = registry[event.type];
        return {
          event,
          label: config ? t(config.labelKey) : event.type,
          icon: config?.icon,
          tone: config?.tone,
          href: getHref?.(event),
        };
      }),
    [events, registry, t, getHref],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return resolved;
    return resolved.filter((item) => item.label.toLowerCase().includes(needle));
  }, [resolved, query]);

  const groups = useMemo(() => {
    const now = new Date();
    const order: string[] = [];
    const map = new Map<string, typeof filtered>();
    for (let i = filtered.length - 1; i >= 0; i -= 1) {
      const item = filtered[i]!;
      const key = groupKeyForDate(item.event.occurredAt, now, i18n.language);
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(item);
      } else {
        map.set(key, [item]);
        order.push(key);
      }
    }
    return order.map((key) => [key, map.get(key)!] as const);
  }, [filtered, i18n.language]);

  function handleKeyDown(event: KeyboardEvent<HTMLOListElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("[data-timeline-item]") ?? [],
    );
    if (items.length === 0) return;
    const currentIndex = items.findIndex((el) => el === document.activeElement);
    const nextIndex =
      event.key === "ArrowDown"
        ? Math.min(currentIndex + 1, items.length - 1)
        : Math.max(currentIndex - 1, 0);
    items[nextIndex]?.focus();
    event.preventDefault();
  }

  if (isLoading) {
    return (
      <div role="status" aria-label={t("common.loading")} className="flex flex-col gap-3">
        <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
        <div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {(events?.length ?? 0) > 5 && (
        <>
          <DismissibleHint hintId="timeline-search-nav" message={t("timeline.hint")} />
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="pl-8"
            />
          </div>
        </>
      )}

      {groups.length === 0 && <p className="text-muted-foreground text-sm">{emptyLabel}</p>}

      <ol ref={listRef} onKeyDown={handleKeyDown} className="flex flex-col gap-4">
        {groups.map(([groupKey, items]) => (
          <li key={groupKey}>
            <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
              {groupKey === "today"
                ? t("timeline.today")
                : groupKey === "yesterday"
                  ? t("timeline.yesterday")
                  : groupKey}
            </p>
            <ol className="flex flex-col gap-3">
              {items.map(({ event, label, icon: Icon, tone, href }) => {
                const inner = (
                  <>
                    {Icon && (
                      <Icon
                        className={`mt-0.5 size-4 shrink-0 ${tone ? TONE_CLASSES[tone] : "text-muted-foreground"}`}
                        aria-hidden="true"
                      />
                    )}
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{label}</span>
                      <span className="text-muted-foreground text-xs">
                        {formatDateTime(event.occurredAt, i18n.language)}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={event.id} className="border-l-2 pl-3">
                    {href ? (
                      <Link
                        href={href}
                        data-timeline-item
                        className="hover:bg-accent/50 focus-visible:ring-ring -ml-3 flex items-start gap-2 rounded-md px-3 py-1 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div data-timeline-item tabIndex={-1} className="flex items-start gap-2">
                        {inner}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}
