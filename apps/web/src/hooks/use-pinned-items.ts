"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import { getPinnedItems, togglePinnedItem, type PinnedItemRef } from "../lib/pinned-items";
import { useMe } from "./use-auth";
import { useCurrentTenantId } from "./use-current-tenant";

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getServerSnapshot(): string {
  return "[]";
}

/**
 * The one store behind both "Favorites" and "Pinned Items" — see
 * docs/UI_REDESIGN_PLAN.md Chapter 5, design decision 6.
 */
export function usePinnedItems(): {
  items: PinnedItemRef[];
  isPinned: (id: string) => boolean;
  togglePinned: (item: Omit<PinnedItemRef, "pinnedAt">) => void;
} {
  const { data: me } = useMe();
  const [tenantId] = useCurrentTenantId();
  const userId = me?.user.id ?? null;

  const getSnapshot = useCallback(() => {
    if (!userId || !tenantId) return "[]";
    return JSON.stringify(getPinnedItems(userId, tenantId));
  }, [userId, tenantId]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const items = useMemo(() => JSON.parse(snapshot) as PinnedItemRef[], [snapshot]);
  const pinnedIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);

  const togglePinned = useCallback(
    (item: Omit<PinnedItemRef, "pinnedAt">) => {
      if (!userId || !tenantId) return;
      togglePinnedItem(userId, tenantId, item);
    },
    [userId, tenantId],
  );

  return {
    items,
    isPinned: (id: string) => pinnedIds.has(id),
    togglePinned,
  };
}
