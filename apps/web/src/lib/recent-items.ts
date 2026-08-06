/**
 * Client-side, per-(user, tenant) recent-items store — see
 * docs/UI_REDESIGN_PLAN.md Chapter 5, design decisions 4-5.
 * Deliberately `localStorage`-only, unlike a synced backend
 * preference: no new backend endpoint exists for this chapter
 * (`ARCHITECTURE_LOCK.md` §3). Namespaced per user *and* tenant,
 * unlike `use-sidebar-state.ts`/`use-dark-mode.ts`'s browser-global
 * keys, since recent activity is workflow state tied to one person in
 * one tenant, not a shared display preference.
 */

export interface RecentItemRef {
  /** `${entityType}:${entityId}` for an entity, `page:${href}` for a nav page. */
  id: string;
  kind: "entity" | "page";
  entityType?: string;
  label: string;
  href: string;
  viewedAt: number;
}

export const DEFAULT_MAX_RECENT_ITEMS = 8;

function storageKey(userId: string, tenantId: string): string {
  return `rentos_recent_items:${userId}:${tenantId}`;
}

function readAll(userId: string, tenantId: string): RecentItemRef[] {
  const raw = window.localStorage.getItem(storageKey(userId, tenantId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentItemRef[]) : [];
  } catch {
    return [];
  }
}

function writeAll(userId: string, tenantId: string, items: RecentItemRef[]): void {
  window.localStorage.setItem(storageKey(userId, tenantId), JSON.stringify(items));
  window.dispatchEvent(new StorageEvent("storage"));
}

export function getRecentItems(userId: string, tenantId: string): RecentItemRef[] {
  return readAll(userId, tenantId);
}

/** Adds/moves an item to the front; de-duplicates by `id`; caps at `max`. */
export function addRecentItem(
  userId: string,
  tenantId: string,
  item: Omit<RecentItemRef, "viewedAt">,
  max: number = DEFAULT_MAX_RECENT_ITEMS,
): void {
  const existing = readAll(userId, tenantId).filter((entry) => entry.id !== item.id);
  const next = [{ ...item, viewedAt: Date.now() }, ...existing].slice(0, max);
  writeAll(userId, tenantId, next);
}
