/**
 * Single shared platform check for the `⌘`/`Ctrl` symbol shown across the
 * sidebar search trigger, the header shortcut badge, and the Shortcuts
 * Help dialog — see docs/UI_REDESIGN_PLAN.md Chapter 5, design decision 8.
 * Never called at module-eval time (SSR has no `navigator`) — always call
 * from an effect or event handler.
 */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

/** `⌘K` on Mac, `Ctrl+K` elsewhere — the one shared formatter for shortcut badges. */
export function formatShortcutKeys(keys: string[], isMac: boolean): string {
  return keys
    .map((key) => {
      if (key === "mod") return isMac ? "⌘" : "Ctrl";
      if (key === "shift") return isMac ? "⇧" : "Shift";
      if (key === "alt") return isMac ? "⌥" : "Alt";
      if (key.length === 1) return key.toUpperCase();
      return key;
    })
    .join(isMac ? "" : "+");
}
