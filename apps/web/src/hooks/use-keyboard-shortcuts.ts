"use client";

import { useEffect, useRef } from "react";

import { CHORD_TIMEOUT_MS, matchShortcut, type KeyboardShortcut } from "../lib/keyboard-shortcuts";

/**
 * Wires one global `keydown` listener that dispatches to the given
 * shortcut list — see docs/UI_REDESIGN_PLAN.md Chapter 5, design
 * decision 3. Callers rebuild `shortcuts` with real closures (router,
 * dialog state); the listener itself never changes shape when a new
 * shortcut is added.
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]): void {
  const pendingChordKey = useRef<string | null>(null);
  const chordTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clearChord(): void {
      pendingChordKey.current = null;
      if (chordTimeout.current) {
        clearTimeout(chordTimeout.current);
        chordTimeout.current = null;
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      const { matched, nextPendingChordKey } = matchShortcut(
        event,
        shortcuts,
        pendingChordKey.current,
      );

      if (matched) {
        event.preventDefault();
        clearChord();
        matched.handler();
        return;
      }

      if (nextPendingChordKey) {
        pendingChordKey.current = nextPendingChordKey;
        if (chordTimeout.current) clearTimeout(chordTimeout.current);
        chordTimeout.current = setTimeout(clearChord, CHORD_TIMEOUT_MS);
      } else if (pendingChordKey.current) {
        clearChord();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearChord();
    };
  }, [shortcuts]);
}
