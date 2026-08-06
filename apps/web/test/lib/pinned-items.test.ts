import { beforeEach, describe, expect, it } from "vitest";

import { getPinnedItems, isPinned, togglePinnedItem } from "../../src/lib/pinned-items";

beforeEach(() => {
  window.localStorage.clear();
});

const ITEM = {
  id: "customer:1",
  entityType: "customer",
  entityId: "1",
  label: "Jane Doe",
  href: "/app/customers/1",
};

describe("pinned-items store", () => {
  it("is empty by default", () => {
    expect(getPinnedItems("user-1", "tenant-1")).toEqual([]);
    expect(isPinned("user-1", "tenant-1", ITEM.id)).toBe(false);
  });

  it("pins an item on the first toggle", () => {
    togglePinnedItem("user-1", "tenant-1", ITEM);
    expect(isPinned("user-1", "tenant-1", ITEM.id)).toBe(true);
    expect(getPinnedItems("user-1", "tenant-1").map((item) => item.id)).toEqual([ITEM.id]);
  });

  it("unpins an item on the second toggle", () => {
    togglePinnedItem("user-1", "tenant-1", ITEM);
    togglePinnedItem("user-1", "tenant-1", ITEM);
    expect(isPinned("user-1", "tenant-1", ITEM.id)).toBe(false);
    expect(getPinnedItems("user-1", "tenant-1")).toEqual([]);
  });

  it("supports any entityType without special-casing", () => {
    togglePinnedItem("user-1", "tenant-1", {
      id: "future-entity:1",
      entityType: "future-entity",
      entityId: "1",
      label: "Something new",
      href: "/app/future/1",
    });
    expect(isPinned("user-1", "tenant-1", "future-entity:1")).toBe(true);
  });
});
