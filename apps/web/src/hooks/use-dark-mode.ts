"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "rentos_portal_dark_mode";

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot(): boolean {
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

function getServerSnapshot(): boolean {
  return false;
}

/** Persists the customer portal's dark-mode preference and keeps <html class="dark"> in sync. */
export function useDarkMode(): [boolean, (enabled: boolean) => void] {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const setDarkMode = useCallback((enabled: boolean) => {
    window.localStorage.setItem(STORAGE_KEY, String(enabled));
    window.dispatchEvent(new StorageEvent("storage"));
  }, []);

  return [isDark, setDarkMode];
}
