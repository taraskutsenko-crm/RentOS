import { beforeEach, describe, expect, it } from "vitest";

import { addRecentItem, getRecentItems } from "../../src/lib/recent-items";

beforeEach(() => {
  window.localStorage.clear();
});

describe("recent-items store", () => {
  it("returns an empty list for a user/tenant with no history", () => {
    expect(getRecentItems("user-1", "tenant-1")).toEqual([]);
  });

  it("adds an item to the front, most-recent-first", () => {
    addRecentItem("user-1", "tenant-1", {
      id: "rental:1",
      kind: "entity",
      entityType: "rental",
      label: "RNT-000001",
      href: "/app/rentals/1",
    });
    addRecentItem("user-1", "tenant-1", {
      id: "rental:2",
      kind: "entity",
      entityType: "rental",
      label: "RNT-000002",
      href: "/app/rentals/2",
    });

    const items = getRecentItems("user-1", "tenant-1");
    expect(items.map((item) => item.id)).toEqual(["rental:2", "rental:1"]);
  });

  it("de-duplicates by id, moving a re-viewed item back to the front", () => {
    addRecentItem("user-1", "tenant-1", {
      id: "rental:1",
      kind: "entity",
      label: "RNT-000001",
      href: "/app/rentals/1",
    });
    addRecentItem("user-1", "tenant-1", {
      id: "rental:2",
      kind: "entity",
      label: "RNT-000002",
      href: "/app/rentals/2",
    });
    addRecentItem("user-1", "tenant-1", {
      id: "rental:1",
      kind: "entity",
      label: "RNT-000001",
      href: "/app/rentals/1",
    });

    const items = getRecentItems("user-1", "tenant-1");
    expect(items).toHaveLength(2);
    expect(items[0]?.id).toBe("rental:1");
  });

  it("caps the list at the given max", () => {
    for (let i = 0; i < 5; i += 1) {
      addRecentItem(
        "user-1",
        "tenant-1",
        { id: `rental:${i}`, kind: "entity", label: `R${i}`, href: `/app/rentals/${i}` },
        3,
      );
    }
    expect(getRecentItems("user-1", "tenant-1")).toHaveLength(3);
  });

  it("keeps different users' and tenants' histories independent", () => {
    addRecentItem("user-1", "tenant-1", {
      id: "rental:1",
      kind: "entity",
      label: "R1",
      href: "/app/rentals/1",
    });
    addRecentItem("user-2", "tenant-1", {
      id: "rental:2",
      kind: "entity",
      label: "R2",
      href: "/app/rentals/2",
    });
    addRecentItem("user-1", "tenant-2", {
      id: "rental:3",
      kind: "entity",
      label: "R3",
      href: "/app/rentals/3",
    });

    expect(getRecentItems("user-1", "tenant-1").map((item) => item.id)).toEqual(["rental:1"]);
    expect(getRecentItems("user-2", "tenant-1").map((item) => item.id)).toEqual(["rental:2"]);
    expect(getRecentItems("user-1", "tenant-2").map((item) => item.id)).toEqual(["rental:3"]);
  });
});
