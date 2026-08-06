"use client";

import { Card, CardContent } from "@rentos/ui";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { shortcutLabel } from "../../../../components/shell/shortcuts-help-dialog";
import { useAppShortcuts } from "../../../../hooks/use-app-shortcuts";
import { isMacPlatform } from "../../../../lib/platform";

const NOOP = () => {};

/**
 * A permanent, discoverable home for every registered shortcut — reads the
 * exact same registry as the Shift+? help modal, so the two can never drift
 * apart. See docs/PRODUCT_BIBLE.md §11 (Discoverability) and
 * docs/UI_REDESIGN_PLAN.md Chapter 6, design decision 10.
 */
export default function ShortcutsSettingsPage() {
  const { t } = useTranslation();
  const isMac = useMemo(() => isMacPlatform(), []);
  const shortcuts = useAppShortcuts({
    onOpenCommandPalette: NOOP,
    onOpenQuickCreate: NOOP,
    onOpenShortcutsHelp: NOOP,
  });

  const groups = useMemo(() => {
    const map = new Map<string, typeof shortcuts>();
    for (const shortcut of shortcuts) {
      const list = map.get(shortcut.groupKey) ?? [];
      list.push(shortcut);
      map.set(shortcut.groupKey, list);
    }
    return Array.from(map.entries());
  }, [shortcuts]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("app.shell.shortcuts.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("app.shell.shortcuts.settingsSubtitle")}</p>
      </div>

      <Card className="w-full max-w-2xl">
        <CardContent className="flex flex-col gap-5 pt-6">
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
        </CardContent>
      </Card>
    </div>
  );
}
