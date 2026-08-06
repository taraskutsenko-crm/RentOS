/**
 * Client-side, per-(user, tenant) pinned-items store — the single
 * underlying primitive serving both "Favorites" and "Pinned Items"
 * from the chapter's own build list, per docs/UI_REDESIGN_PLAN.md
 * Chapter 5, design decision 6: read together, their descriptions are
 * structurally identical, and two parallel stores would be exactly the
 * duplicated implementation this chapter's own rules forbid. Generic
 * over `entityType` — never hardcoded to a specific entity — so a
 * future entity type is one `<PinButton entityType="...">` call, no
 * new store code.
 */

export interface PinnedItemRef {
  /** `${entityType}:${entityId}`. */
  id: string;
  entityType: string;
  entityId: string;
  label: string;
  href: string;
  pinnedAt: number;
}

function storageKey(userId: string, tenantId: string): string {
  return `rentos_pinned_items:${userId}:${tenantId}`;
}

function readAll(userId: string, tenantId: string): PinnedItemRef[] {
  const raw = window.localStorage.getItem(storageKey(userId, tenantId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PinnedItemRef[]) : [];
  } catch {
    return [];
  }
}

function writeAll(userId: string, tenantId: string, items: PinnedItemRef[]): void {
  window.localStorage.setItem(storageKey(userId, tenantId), JSON.stringify(items));
  window.dispatchEvent(new StorageEvent("storage"));
}

export function getPinnedItems(userId: string, tenantId: string): PinnedItemRef[] {
  return readAll(userId, tenantId);
}

export function isPinned(userId: string, tenantId: string, id: string): boolean {
  return readAll(userId, tenantId).some((entry) => entry.id === id);
}

/** Adds the item if not already pinned, or removes it if it is — the one toggle both Favorites and Pinned Items call. */
export function togglePinnedItem(
  userId: string,
  tenantId: string,
  item: Omit<PinnedItemRef, "pinnedAt">,
): void {
  const existing = readAll(userId, tenantId);
  const next = existing.some((entry) => entry.id === item.id)
    ? existing.filter((entry) => entry.id !== item.id)
    : [{ ...item, pinnedAt: Date.now() }, ...existing];
  writeAll(userId, tenantId, next);
}
