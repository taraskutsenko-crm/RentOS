"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function makeGetSnapshot(storageKey: string) {
  return () => window.localStorage.getItem(storageKey) === "true";
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Persists a dark-mode preference under `storageKey` and keeps
 * <html class="dark"> in sync. Callers pass their own key (staff shell vs.
 * customer portal) so the same physical person can hold independent
 * preferences across the two — see docs/UI_REDESIGN_PLAN.md Chapter 1,
 * decision 5.
 */
export function useDarkMode(storageKey: string): [boolean, (enabled: boolean) => void] {
  const isDark = useSyncExternalStore(subscribe, makeGetSnapshot(storageKey), getServerSnapshot);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const setDarkMode = useCallback(
    (enabled: boolean) => {
      window.localStorage.setItem(storageKey, String(enabled));
      window.dispatchEvent(new StorageEvent("storage"));
    },
    [storageKey],
  );

  return [isDark, setDarkMode];
}
