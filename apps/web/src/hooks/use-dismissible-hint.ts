"use client";

import { useCallback, useSyncExternalStore } from "react";

import { useMe } from "./use-auth";

function storageKey(userId: string, hintId: string): string {
  return `rentos_dismissed_hints:${userId}:${hintId}`;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

/**
 * One reusable, per-user "seen it, never show again" primitive for any
 * future discoverability hint — see docs/UI_REDESIGN_PLAN.md Chapter 5,
 * design decision 7. Hidden until the current user is known, so a hint
 * never flashes before auth resolves.
 */
export function useDismissibleHint(hintId: string): { dismissed: boolean; dismiss: () => void } {
  const { data: me } = useMe();
  const userId = me?.user.id ?? null;

  const getSnapshot = useCallback(() => {
    if (!userId) return "true";
    return window.localStorage.getItem(storageKey(userId, hintId)) === "true" ? "true" : "false";
  }, [userId, hintId]);

  const dismissedString = useSyncExternalStore(subscribe, getSnapshot, () => "true");

  const dismiss = useCallback(() => {
    if (!userId) return;
    window.localStorage.setItem(storageKey(userId, hintId), "true");
    window.dispatchEvent(new StorageEvent("storage"));
  }, [userId, hintId]);

  return { dismissed: dismissedString === "true", dismiss };
}
