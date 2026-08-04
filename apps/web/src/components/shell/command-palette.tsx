"use client";

import { cn, Dialog, DialogContent, DialogTitle } from "@rentos/ui";
import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useCurrentTenantRole } from "../../hooks/use-current-tenant-role";
import { ALL_NAV_ITEMS } from "../../lib/nav-registry";
import { roleHasPermission } from "../../lib/permissions";
import type { CommandItem } from "../../lib/command-types";

/**
 * The unified global-search + command-palette surface — see
 * docs/UI_REDESIGN_PLAN.md Chapter 1, decision 3. Architecture only for
 * now: every command today is `kind: "navigate"` (go to a page); the
 * seams for "run action," "create object," real cross-entity search, and
 * "open recent" are typed in docs/UI_REDESIGN_PLAN.md's command-types.ts
 * but not populated — this stays honest about what's implemented rather
 * than faking results with local dummy data.
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
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset synchronously during render on the false->true transition,
  // rather than in an effect — React's recommended pattern for resetting
  // state on a prop change without an extra render pass (and the only
  // form of this reset the `set-state-in-effect` lint rule allows).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }

  // One subscription to the current role, then a plain filter — never
  // call a hook inside a loop/callback (see the fixed version of this
  // file's history for why the first draft here was wrong).
  const { data: tenantRole } = useCurrentTenantRole();

  const commands: CommandItem[] = useMemo(
    () =>
      ALL_NAV_ITEMS.filter(
        (item) => item.permission === null || roleHasPermission(tenantRole?.role, item.permission),
      ).map((item) => ({
        id: item.id,
        kind: "navigate" as const,
        label: t(item.labelKey),
        href: item.href,
        group: t("app.shell.commandPalette.pagesGroup"),
      })),
    [t, tenantRole?.role],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return commands;
    return commands.filter((command) => command.label.toLowerCase().includes(normalized));
  }, [commands, query]);

  // Focusing the input is a genuine external-system synchronization
  // (the DOM), so this one legitimately stays an effect.
  useEffect(() => {
    if (!open) return undefined;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  function runCommand(command: CommandItem): void {
    onOpenChange(false);
    if (command.href) router.push(command.href);
  }

  function handleQueryChange(value: string): void {
    setQuery(value);
    setActiveIndex(0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = filtered[activeIndex];
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
          <kbd className="border-border text-muted-foreground rounded border px-1.5 py-0.5 text-xs">
            Esc
          </kbd>
        </div>
        <ul role="listbox" className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <li className="text-muted-foreground px-3 py-6 text-center text-sm">
              {t("app.shell.commandPalette.noResults")}
            </li>
          )}
          {filtered.map((command, index) => (
            <li key={command.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => runCommand(command)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors duration-[var(--duration-fast)]",
                  index === activeIndex
                    ? "bg-primary-light text-primary"
                    : "text-foreground hover:bg-neutral-50 dark:hover:bg-neutral-800",
                )}
              >
                <span>{command.label}</span>
                {index === activeIndex && (
                  <CornerDownLeft className="size-3.5 shrink-0" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
