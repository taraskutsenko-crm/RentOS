"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "rentos_current_tenant_id";

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot(): string | null {
  return window.localStorage.getItem(STORAGE_KEY);
}

function getServerSnapshot(): string | null {
  return null;
}

/**
 * Persists which tenant the user last selected, purely as a client-side
 * convenience so tenant-scoped pages (e.g. Customers) know which
 * :tenantId to call. This is NOT a security boundary — the API
 * independently re-verifies membership for every request regardless of
 * what tenantId the client sends (see TenantGuard).
 */
export function useCurrentTenantId(): [string | null, (id: string) => void] {
  const tenantId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTenantId = useCallback((id: string) => {
    window.localStorage.setItem(STORAGE_KEY, id);
    // The native "storage" event only fires in *other* tabs, not this one —
    // dispatch it manually so this tab's subscribers see the update too.
    window.dispatchEvent(new StorageEvent("storage"));
  }, []);

  return [tenantId, setTenantId];
}
