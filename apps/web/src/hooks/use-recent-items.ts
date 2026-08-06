"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
  addRecentItem,
  DEFAULT_MAX_RECENT_ITEMS,
  getRecentItems,
  type RecentItemRef,
} from "../lib/recent-items";
import { useMe } from "./use-auth";
import { useCurrentTenantId } from "./use-current-tenant";

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getServerSnapshot(): string {
  return "[]";
}

/** Reactive read of the current user+tenant's recent items, most-recent-first. */
export function useRecentItems(max: number = DEFAULT_MAX_RECENT_ITEMS): RecentItemRef[] {
  const { data: me } = useMe();
  const [tenantId] = useCurrentTenantId();
  const userId = me?.user.id ?? null;

  const getSnapshot = useCallback(() => {
    if (!userId || !tenantId) return "[]";
    return JSON.stringify(getRecentItems(userId, tenantId));
  }, [userId, tenantId]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    const parsed = JSON.parse(snapshot) as RecentItemRef[];
    return parsed.slice(0, max);
  }, [snapshot, max]);
}

/** Records a view of a page or entity — call once when the page/detail view mounts. */
export function useTrackRecentItem(): (item: Omit<RecentItemRef, "viewedAt">) => void {
  const { data: me } = useMe();
  const [tenantId] = useCurrentTenantId();
  const userId = me?.user.id ?? null;

  return useCallback(
    (item: Omit<RecentItemRef, "viewedAt">) => {
      if (!userId || !tenantId) return;
      addRecentItem(userId, tenantId, item);
    },
    [userId, tenantId],
  );
}
