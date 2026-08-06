"use client";

import { cn, Dialog, DialogContent, DialogTitle } from "@rentos/ui";
import { Clock, CornerDownLeft, Loader2, LogOut, Moon, Pin, Search, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useLogout, useMe } from "../../hooks/use-auth";
import { useCurrentTenantId } from "../../hooks/use-current-tenant";
import { useCurrentTenantRole } from "../../hooks/use-current-tenant-role";
import { useDarkMode } from "../../hooks/use-dark-mode";
import { usePinnedItems } from "../../hooks/use-pinned-items";
import { useRecentItems } from "../../hooks/use-recent-items";
import type { CommandItem } from "../../lib/command-types";
import { ALL_NAV_ITEMS } from "../../lib/nav-registry";
import { roleHasPermission } from "../../lib/permissions";
import { QUICK_ACTION_DEFINITIONS } from "../../lib/quick-actions";
import { SEARCH_PROVIDERS } from "../../lib/search-providers";

const SEARCH_DEBOUNCE_MS = 300;
const MAX_RECENT_SHOWN = 5;

/**
 * The unified global-search + command palette surface — see
 * docs/UI_REDESIGN_PLAN.md Chapter 1, decision 3, and Chapter 5's full
 * rebuild (design decisions 1-3, 9). Every section (Recent, Pinned,
 * Quick Actions, Commands, Navigation, Search) composes the same
 * `CommandItem` shape — see docs/UI_PATTERNS.md's Command Palette
 * entry for the full behavioral spec.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [tenantId] = useCurrentTenantId();
  const { data: tenantRole } = useCurrentTenantRole();
  const { data: me } = useMe();
  const [isDark, setDarkMode] = useDarkMode("rentos_app_dark_mode");
  const logout = useLogout();
  const { items: pinnedItems } = usePinnedItems();
  const recentItems = useRecentItems(MAX_RECENT_SHOWN);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const [searchResults, setSearchResults] = useState<CommandItem[]>([]);
  // Tracks which debounced query `searchResults` was fetched for, so
  // "loading" and "stale results from the previous query" are both derived
  // below instead of tracked as separate state set synchronously in the
  // effect (react-hooks/set-state-in-effect only allows setState from an
  // async callback, not the effect body itself).
  const [searchResultsQuery, setSearchResultsQuery] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset synchronously during render on the false->true transition,
  // rather than in an effect — React's recommended pattern for resetting
  // state on a prop change without an extra render pass.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      setActiveIndex(0);
      setSearchResults([]);
      setSearchResultsQuery(null);
    }
  }

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (!open) return undefined;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  // Real, working cross-entity search over five providers — see
  // docs/UI_REDESIGN_PLAN.md Chapter 5, design decision 2.
  useEffect(() => {
    if (!debouncedQuery || !tenantId) {
      return undefined;
    }
    let cancelled = false;
    const providers = SEARCH_PROVIDERS.filter(
      (provider) =>
        provider.permission === null || roleHasPermission(tenantRole?.role, provider.permission),
    );
    void Promise.all(
      providers.map((provider) =>
        provider
          .search(debouncedQuery, tenantId)
          .then((results) =>
            results.map((result): CommandItem => ({
              id: result.id,
              kind: "search-result",
              label: result.label,
              description: result.description,
              href: result.href,
              icon: provider.icon,
              group: t(provider.labelKey),
            })),
          )
          .catch(() => []),
      ),
    ).then((groups) => {
      if (!cancelled) {
        setSearchResults(groups.flat());
        setSearchResultsQuery(debouncedQuery);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, tenantId, tenantRole?.role, t]);

  const navigateCommands: CommandItem[] = useMemo(
    () =>
      ALL_NAV_ITEMS.filter(
        (item) => item.permission === null || roleHasPermission(tenantRole?.role, item.permission),
      ).map((item) => ({
        id: `nav:${item.id}`,
        kind: "navigate" as const,
        label: t(item.labelKey),
        href: item.href,
        icon: item.icon,
        group: t("app.shell.commandPalette.pagesGroup"),
      })),
    [t, tenantRole?.role],
  );

  const quickActionCommands: CommandItem[] = useMemo(
    () =>
      QUICK_ACTION_DEFINITIONS.filter(
        (item) => item.permission === null || roleHasPermission(tenantRole?.role, item.permission),
      ).map((item) => ({
        id: `quick-action:${item.id}`,
        kind: "navigate" as const,
        label: t(item.labelKey),
        href: item.href,
        icon: item.icon,
        group: t("app.shell.commandPalette.quickActionsGroup"),
      })),
    [t, tenantRole?.role],
  );

  // Real, working "action" kind commands — not a fabricated example, see
  // docs/UI_REDESIGN_PLAN.md Chapter 5, design decision 1's AI-readiness note.
  const commandCommands: CommandItem[] = useMemo(
    () =>
      me
        ? [
            {
              id: "command:toggle-dark-mode",
              kind: "action" as const,
              label: isDark ? t("app.shell.lightMode") : t("app.shell.darkMode"),
              icon: isDark ? Sun : Moon,
              run: () => setDarkMode(!isDark),
              group: t("app.shell.commandPalette.commandsGroup"),
            },
            {
              id: "command:logout",
              kind: "action" as const,
              label: t("nav.logout"),
              icon: LogOut,
              run: () => {
                void logout.mutateAsync().then(() => router.replace("/login"));
              },
              group: t("app.shell.commandPalette.commandsGroup"),
            },
          ]
        : [],
    [me, isDark, t, setDarkMode, logout, router],
  );

  const pinnedCommands: CommandItem[] = useMemo(
    () =>
      pinnedItems.map((item) => ({
        id: `pinned:${item.id}`,
        kind: "pinned" as const,
        label: item.label,
        href: item.href,
        icon: Pin,
        group: t("app.shell.commandPalette.pinnedGroup"),
      })),
    [pinnedItems, t],
  );

  const recentCommands: CommandItem[] = useMemo(
    () =>
      recentItems.map((item) => ({
        id: `recent:${item.id}`,
        kind: "recent" as const,
        label: item.label,
        href: item.href,
        icon: Clock,
        group: t("app.shell.commandPalette.recentGroup"),
      })),
    [recentItems, t],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;
  // Derived, not state: `searchResultsQuery` records which debounced query
  // `searchResults` belongs to, so both "stale results from the previous
  // query" and "loading" fall out of a comparison instead of separate state
  // set synchronously inside the effect above.
  const activeSearchResults =
    debouncedQuery && tenantId && searchResultsQuery === debouncedQuery ? searchResults : [];
  const activeSearchLoading =
    isSearching && (query.trim() !== debouncedQuery || searchResultsQuery !== debouncedQuery);

  function matchesQuery(item: CommandItem): boolean {
    return !normalizedQuery || item.label.toLowerCase().includes(normalizedQuery);
  }

  // Never opens empty (docs/UI_REDESIGN_PLAN.md Chapter 5, build item 9):
  // an empty query always composes Recent + Pinned + Quick Actions +
  // Commands + Navigation, each permission-filtered upstream.
  const sections: CommandItem[] = isSearching
    ? [
        ...quickActionCommands.filter(matchesQuery),
        ...pinnedCommands.filter(matchesQuery),
        ...commandCommands.filter(matchesQuery),
        ...navigateCommands.filter(matchesQuery),
        ...activeSearchResults,
      ]
    : [
        ...recentCommands,
        ...pinnedCommands,
        ...quickActionCommands,
        ...commandCommands,
        ...navigateCommands,
      ];

  function runCommand(command: CommandItem): void {
    onOpenChange(false);
    if (command.run) {
      command.run();
    } else if (command.href) {
      router.push(command.href);
    }
  }

  function handleQueryChange(value: string): void {
    setQuery(value);
    setActiveIndex(0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(sections.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = sections[activeIndex];
      if (command) runCommand(command);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        className="top-[20%] max-w-xl translate-y-0 gap-0 p-0"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{t("app.shell.commandPalette.title")}</DialogTitle>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("app.shell.commandPalette.placeholder")}
            className="placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
            aria-label={t("app.shell.commandPalette.placeholder")}
          />
          {activeSearchLoading && (
            <Loader2
              className="text-muted-foreground size-4 shrink-0 animate-spin"
              aria-hidden="true"
            />
          )}
          <kbd className="border-border text-muted-foreground rounded border px-1.5 py-0.5 text-xs">
            Esc
          </kbd>
        </div>
        <ul role="listbox" className="max-h-96 overflow-y-auto p-2">
          {sections.length === 0 && !activeSearchLoading && (
            <li className="text-muted-foreground px-3 py-6 text-center text-sm">
              {t("app.shell.commandPalette.noResults")}
            </li>
          )}
          {sections.map((command, index) => {
            const showGroupHeader = index === 0 || sections[index - 1]?.group !== command.group;
            const Icon = command.icon;
            return (
              <li key={command.id}>
                {showGroupHeader && (
                  <p className="text-muted-foreground px-3 pt-3 pb-1 text-xs font-medium tracking-wide uppercase first:pt-1">
                    {command.group}
                  </p>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => runCommand(command)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors duration-[var(--duration-fast)]",
                    index === activeIndex
                      ? "bg-primary-light text-primary"
                      : "text-foreground hover:bg-neutral-50 dark:hover:bg-neutral-800",
                  )}
                >
                  {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
                  <span className="min-w-0 flex-1 truncate">
                    {command.label}
                    {command.description && (
                      <span className="text-muted-foreground ml-1.5 truncate text-xs">
                        {command.description}
                      </span>
                    )}
                  </span>
                  {index === activeIndex && (
                    <CornerDownLeft className="size-3.5 shrink-0" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
