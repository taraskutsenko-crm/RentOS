/**
 * The single global keyboard-shortcut registry — see
 * docs/UI_REDESIGN_PLAN.md Chapter 5, design decision 3. Adding a
 * shortcut means adding an entry to `SHORTCUTS` below; nothing else in
 * the product needs to change. One listener (`useKeyboardShortcuts`,
 * wired once in `apps/app/layout.tsx`) dispatches to this registry.
 */

export interface KeyboardShortcut {
  id: string;
  /** A single key ("k", "n", "/", "?") or a chord ["g", "c"] (first key, then second). */
  keys: [string] | [string, string];
  /** True when the first key needs a modifier (Cmd on Mac, Ctrl elsewhere). */
  mod?: boolean;
  /** True when the shortcut needs Shift held (e.g. "?" is Shift+/ on most layouts). */
  shift?: boolean;
  descriptionKey: string;
  groupKey: string;
  handler: () => void;
}

/** Chord shortcuts wait this long (ms) for the second key before resetting. */
export const CHORD_TIMEOUT_MS = 1000;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  // `isContentEditable` is spec-correct but not reliably computed by every
  // DOM implementation (e.g. jsdom) — the raw attribute is checked too so
  // this guard holds in every environment, not just real browsers.
  if (target.isContentEditable) return true;
  const contentEditableAttr = target.getAttribute("contenteditable");
  if (contentEditableAttr === "true" || contentEditableAttr === "") return true;
  return target.getAttribute("role") === "textbox";
}

/**
 * Matches a real `KeyboardEvent` against the registry, tracking a
 * short-lived "awaiting second key" chord state. Returns the matched
 * shortcut (if any) and the next chord state to store.
 */
export function matchShortcut(
  event: KeyboardEvent,
  shortcuts: KeyboardShortcut[],
  pendingChordKey: string | null,
): { matched: KeyboardShortcut | null; nextPendingChordKey: string | null } {
  // Never intercept typing — every bare-letter/chord shortcut is suppressed
  // while focus is inside an editable element (UI_AUDIT.md finding #30).
  // Mod-combo shortcuts (Cmd/Ctrl+K) remain safe to intercept regardless,
  // since that combination is never produced by normal typing.
  const editable = isEditableTarget(event.target);
  const key = event.key.toLowerCase();

  if (pendingChordKey) {
    const chordMatch = shortcuts.find(
      (shortcut) =>
        shortcut.keys.length === 2 &&
        shortcut.keys[0] === pendingChordKey &&
        shortcut.keys[1] === key &&
        !editable &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey,
    );
    return { matched: chordMatch ?? null, nextPendingChordKey: null };
  }

  const hasMod = event.metaKey || event.ctrlKey;
  const singleKeyMatch = shortcuts.find((shortcut) => {
    if (shortcut.keys.length !== 1) return false;
    if (shortcut.keys[0] !== key) return false;
    // Require an exact modifier match, not just "mod/shift present when
    // required" — otherwise a shortcut with no `shift` requirement (e.g.
    // "/") also fires on Shift+/, which produces key "/" instead of "?" on
    // some keyboard layouts and would silently steal the "?" help shortcut.
    if (Boolean(shortcut.mod) !== hasMod) return false;
    if (Boolean(shortcut.shift) !== event.shiftKey) return false;
    if (!shortcut.mod && editable) return false;
    return true;
  });
  if (singleKeyMatch) return { matched: singleKeyMatch, nextPendingChordKey: null };

  // Start a chord if this key is a known chord opener, focus isn't editable,
  // and no modifier is held (chords are always plain-letter sequences).
  const hasAnyModifier = hasMod || event.shiftKey;
  const isChordOpener =
    !editable &&
    !hasAnyModifier &&
    shortcuts.some((shortcut) => shortcut.keys.length === 2 && shortcut.keys[0] === key);
  return { matched: null, nextPendingChordKey: isChordOpener ? key : null };
}
