"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "rentos_sidebar_collapsed";

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

/** Persists the staff sidebar's collapsed/expanded preference across sessions. */
export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setCollapsed = useCallback((value: boolean) => {
    window.localStorage.setItem(STORAGE_KEY, String(value));
    window.dispatchEvent(new StorageEvent("storage"));
  }, []);

  return [collapsed, setCollapsed];
}

/** Tracks whether the mobile off-canvas sidebar drawer is open. Not persisted — always closed on navigation. */
export function useMobileNavOpen(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  return [open, setOpen];
}

/** Closes the mobile drawer automatically whenever the route changes. */
export function useCloseMobileNavOnRouteChange(
  pathname: string,
  setOpen: (open: boolean) => void,
): void {
  useEffect(() => {
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only re-runs on pathname change
  }, [pathname]);
}
