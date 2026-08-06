"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { formatShortcutKeys, isMacPlatform } from "../../lib/platform";
import { DismissibleHint } from "./dismissible-hint";

/** The one real discoverability hint this chapter ships — see docs/UI_REDESIGN_PLAN.md Chapter 5, design decision 7. */
export function CommandPaletteHint({ className }: { className?: string }) {
  const { t } = useTranslation();
  const isMac = useMemo(() => isMacPlatform(), []);
  const keys = formatShortcutKeys(["mod"], isMac);

  return (
    <DismissibleHint
      hintId="command-palette-intro"
      message={t("app.shell.commandPalette.hint", { keys: `${keys}K` })}
      className={className}
    />
  );
}
