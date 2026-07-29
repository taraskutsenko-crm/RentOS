import { describe, expect, it } from "vitest";

import { roleHasPermission } from "../../src/lib/permissions";

describe("roleHasPermission", () => {
  it("grants OWNER every permission", () => {
    expect(roleHasPermission("OWNER", "assets.delete")).toBe(true);
    expect(roleHasPermission("OWNER", "asset_categories.manage")).toBe(true);
  });

  it("denies VIEWER any mutating permission", () => {
    expect(roleHasPermission("VIEWER", "assets.create")).toBe(false);
    expect(roleHasPermission("VIEWER", "assets.update")).toBe(false);
    expect(roleHasPermission("VIEWER", "assets.delete")).toBe(false);
  });

  it("allows VIEWER read permissions", () => {
    expect(roleHasPermission("VIEWER", "assets.read")).toBe(true);
  });

  it("denies MANAGER assets.delete", () => {
    expect(roleHasPermission("MANAGER", "assets.delete")).toBe(false);
    expect(roleHasPermission("MANAGER", "assets.create")).toBe(true);
  });

  it("returns false for an undefined role", () => {
    expect(roleHasPermission(undefined, "assets.read")).toBe(false);
  });

  it("grants MANAGER quote commercial actions but not delete/manageTemplates", () => {
    expect(roleHasPermission("MANAGER", "quotes.send")).toBe(true);
    expect(roleHasPermission("MANAGER", "quotes.convert")).toBe(true);
    expect(roleHasPermission("MANAGER", "quotes.delete")).toBe(false);
    expect(roleHasPermission("MANAGER", "quotes.manageTemplates")).toBe(false);
  });

  it("restricts VIEWER to quotes.view/quotes.download", () => {
    expect(roleHasPermission("VIEWER", "quotes.view")).toBe(true);
    expect(roleHasPermission("VIEWER", "quotes.download")).toBe(true);
    expect(roleHasPermission("VIEWER", "quotes.send")).toBe(false);
  });
});
