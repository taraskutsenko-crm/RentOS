"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";

import type { KeyboardShortcut } from "../lib/keyboard-shortcuts";

/**
 * The staff shell's real, registered shortcuts — see
 * docs/UI_REDESIGN_PLAN.md Chapter 5, design decision 3. Adding a
 * shortcut means adding an entry here; `useKeyboardShortcuts` never
 * changes. `Esc` is deliberately not registered here — every dialog/
 * dropdown already closes on `Escape` via Radix's own built-in
 * behavior, so a second global handler would only risk double-handling.
 */
export function useAppShortcuts(options: {
  onOpenCommandPalette: () => void;
  onOpenQuickCreate: () => void;
  onOpenShortcutsHelp: () => void;
}): KeyboardShortcut[] {
  const router = useRouter();
  const { onOpenCommandPalette, onOpenQuickCreate, onOpenShortcutsHelp } = options;

  return useMemo<KeyboardShortcut[]>(
    () => [
      {
        id: "open-command-palette",
        keys: ["k"],
        mod: true,
        descriptionKey: "app.shell.shortcuts.openPalette",
        groupKey: "app.shell.shortcuts.groupGeneral",
        handler: onOpenCommandPalette,
      },
      {
        id: "focus-search",
        keys: ["/"],
        descriptionKey: "app.shell.shortcuts.openPalette",
        groupKey: "app.shell.shortcuts.groupGeneral",
        handler: onOpenCommandPalette,
      },
      {
        id: "new",
        keys: ["n"],
        descriptionKey: "app.shell.shortcuts.newItem",
        groupKey: "app.shell.shortcuts.groupGeneral",
        handler: onOpenQuickCreate,
      },
      {
        id: "shortcuts-help",
        keys: ["?"],
        shift: true,
        descriptionKey: "app.shell.shortcuts.help",
        groupKey: "app.shell.shortcuts.groupGeneral",
        handler: onOpenShortcutsHelp,
      },
      {
        id: "go-customers",
        keys: ["g", "c"],
        descriptionKey: "app.shell.shortcuts.goCustomers",
        groupKey: "app.shell.shortcuts.groupNavigation",
        handler: () => router.push("/app/customers"),
      },
      {
        id: "go-rentals",
        keys: ["g", "r"],
        descriptionKey: "app.shell.shortcuts.goRentals",
        groupKey: "app.shell.shortcuts.groupNavigation",
        handler: () => router.push("/app/rentals"),
      },
      {
        id: "go-assets",
        keys: ["g", "a"],
        descriptionKey: "app.shell.shortcuts.goAssets",
        groupKey: "app.shell.shortcuts.groupNavigation",
        handler: () => router.push("/app/assets"),
      },
      {
        id: "go-documents",
        keys: ["g", "d"],
        descriptionKey: "app.shell.shortcuts.goDocuments",
        groupKey: "app.shell.shortcuts.groupNavigation",
        handler: () => router.push("/app/documents"),
      },
      {
        id: "go-quotes",
        keys: ["g", "q"],
        descriptionKey: "app.shell.shortcuts.goQuotes",
        groupKey: "app.shell.shortcuts.groupNavigation",
        handler: () => router.push("/app/quotes"),
      },
    ],
    [router, onOpenCommandPalette, onOpenQuickCreate, onOpenShortcutsHelp],
  );
}
