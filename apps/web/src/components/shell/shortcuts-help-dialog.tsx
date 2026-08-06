"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@rentos/ui";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { isMacPlatform } from "../../lib/platform";
import type { KeyboardShortcut } from "../../lib/keyboard-shortcuts";

function shortcutLabel(shortcut: KeyboardShortcut, isMac: boolean): string {
  if (shortcut.keys.length === 2) {
    return `${shortcut.keys[0].toUpperCase()} ${shortcut.keys[1].toUpperCase()}`;
  }
  const [key] = shortcut.keys;
  const parts: string[] = [];
  if (shortcut.mod) parts.push(isMac ? "⌘" : "Ctrl");
  if (shortcut.shift) parts.push(isMac ? "⇧" : "Shift");
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join(isMac ? "" : "+");
}

/**
 * Lists every registered shortcut, read live from the same registry the
 * global listener uses — see docs/UI_REDESIGN_PLAN.md Chapter 5, design
 * decision 3: this can never drift out of sync with what's actually bound.
 */
export function ShortcutsHelpDialog({
  open,
  onOpenChange,
  shortcuts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts: KeyboardShortcut[];
}) {
  const { t } = useTranslation();
  const isMac = useMemo(() => isMacPlatform(), []);

  const groups = useMemo(() => {
    const map = new Map<string, KeyboardShortcut[]>();
    for (const shortcut of shortcuts) {
      const list = map.get(shortcut.groupKey) ?? [];
      list.push(shortcut);
      map.set(shortcut.groupKey, list);
    }
    return Array.from(map.entries());
  }, [shortcuts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("app.shell.shortcuts.title")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {groups.map(([groupKey, groupShortcuts]) => (
            <div key={groupKey} className="flex flex-col gap-1.5">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {t(groupKey)}
              </p>
              {groupShortcuts.map((shortcut) => (
                <div key={shortcut.id} className="flex items-center justify-between gap-4 text-sm">
                  <span>{t(shortcut.descriptionKey)}</span>
                  <kbd className="border-border bg-background text-muted-foreground rounded border px-1.5 py-0.5 text-xs">
                    {shortcutLabel(shortcut, isMac)}
                  </kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
