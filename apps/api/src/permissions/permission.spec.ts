import { describe, expect, it } from "vitest";

import {
  ALL_PERMISSIONS,
  QUOTE_PERMISSIONS,
  ROLE_PERMISSIONS,
  roleHasPermission,
} from "./permission";

describe("ROLE_PERMISSIONS", () => {
  it("grants OWNER and ADMIN every permission", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(ROLE_PERMISSIONS.OWNER).toContain(permission);
      expect(ROLE_PERMISSIONS.ADMIN).toContain(permission);
    }
  });

  it("restricts ACCOUNTANT and VIEWER to read-only permissions", () => {
    // .download is included as read-only-safe: retrieving a generated PDF
    // never mutates anything, unlike every other quotes.* permission.
    for (const role of ["ACCOUNTANT", "VIEWER"] as const) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(
          permission.endsWith(".read") ||
            permission.endsWith(".view") ||
            permission.endsWith(".download"),
        ).toBe(true);
      }
    }
  });

  it("does not grant MANAGER assets.delete or *.manage permissions", () => {
    expect(ROLE_PERMISSIONS.MANAGER).not.toContain("assets.delete");
    expect(ROLE_PERMISSIONS.MANAGER).not.toContain("asset_categories.manage");
    expect(ROLE_PERMISSIONS.MANAGER).not.toContain("asset_statuses.manage");
    expect(ROLE_PERMISSIONS.MANAGER).not.toContain("asset_fields.manage");
  });

  it("grants MANAGER and TECHNICIAN operational asset permissions", () => {
    for (const role of ["MANAGER", "TECHNICIAN"] as const) {
      expect(roleHasPermission(role, "assets.read")).toBe(true);
      expect(roleHasPermission(role, "assets.update")).toBe(true);
      expect(roleHasPermission(role, "assets.change_status")).toBe(true);
      expect(roleHasPermission(role, "assets.manage_images")).toBe(true);
      expect(roleHasPermission(role, "assets.manage_documents")).toBe(true);
    }
  });

  it("only MANAGER (not TECHNICIAN) can create assets", () => {
    expect(roleHasPermission("MANAGER", "assets.create")).toBe(true);
    expect(roleHasPermission("TECHNICIAN", "assets.create")).toBe(false);
  });

  it("every role maps to at least assets.read and rentals.view", () => {
    for (const role of Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]) {
      expect(roleHasPermission(role, "assets.read")).toBe(true);
      expect(roleHasPermission(role, "rentals.view")).toBe(true);
    }
  });

  it("does not grant MANAGER rentals.delete", () => {
    expect(roleHasPermission("MANAGER", "rentals.delete")).toBe(false);
    expect(roleHasPermission("OWNER", "rentals.delete")).toBe(true);
  });

  it("grants MANAGER full rental lifecycle control except delete", () => {
    for (const permission of [
      "rentals.create",
      "rentals.update",
      "rentals.reserve",
      "rentals.start",
      "rentals.return",
      "rentals.cancel",
    ] as const) {
      expect(roleHasPermission("MANAGER", permission)).toBe(true);
    }
  });

  it("restricts TECHNICIAN to view/start/return, not create/update/reserve/cancel", () => {
    expect(roleHasPermission("TECHNICIAN", "rentals.start")).toBe(true);
    expect(roleHasPermission("TECHNICIAN", "rentals.return")).toBe(true);
    expect(roleHasPermission("TECHNICIAN", "rentals.create")).toBe(false);
    expect(roleHasPermission("TECHNICIAN", "rentals.update")).toBe(false);
    expect(roleHasPermission("TECHNICIAN", "rentals.reserve")).toBe(false);
    expect(roleHasPermission("TECHNICIAN", "rentals.cancel")).toBe(false);
  });

  it("ACCOUNTANT and VIEWER cannot mutate rentals", () => {
    for (const role of ["ACCOUNTANT", "VIEWER"] as const) {
      expect(roleHasPermission(role, "rentals.create")).toBe(false);
      expect(roleHasPermission(role, "rentals.reserve")).toBe(false);
      expect(roleHasPermission(role, "rentals.cancel")).toBe(false);
    }
  });

  it("does not grant MANAGER quotes.delete or quotes.manageTemplates", () => {
    expect(roleHasPermission("MANAGER", "quotes.delete")).toBe(false);
    expect(roleHasPermission("MANAGER", "quotes.manageTemplates")).toBe(false);
    expect(roleHasPermission("OWNER", "quotes.delete")).toBe(true);
    expect(roleHasPermission("OWNER", "quotes.manageTemplates")).toBe(true);
  });

  it("grants MANAGER full quote commercial control except delete/manageTemplates", () => {
    for (const permission of [
      "quotes.view",
      "quotes.create",
      "quotes.update",
      "quotes.send",
      "quotes.accept",
      "quotes.reject",
      "quotes.convert",
      "quotes.duplicate",
      "quotes.download",
    ] as const) {
      expect(roleHasPermission("MANAGER", permission)).toBe(true);
    }
  });

  it("grants TECHNICIAN no quote permissions at all", () => {
    for (const permission of QUOTE_PERMISSIONS) {
      expect(roleHasPermission("TECHNICIAN", permission)).toBe(false);
    }
  });

  it("restricts ACCOUNTANT and VIEWER to quotes.view/quotes.download", () => {
    for (const role of ["ACCOUNTANT", "VIEWER"] as const) {
      expect(roleHasPermission(role, "quotes.view")).toBe(true);
      expect(roleHasPermission(role, "quotes.download")).toBe(true);
      expect(roleHasPermission(role, "quotes.send")).toBe(false);
      expect(roleHasPermission(role, "quotes.convert")).toBe(false);
    }
  });

  it("only OWNER/ADMIN can manage rental billing settings", () => {
    expect(roleHasPermission("OWNER", "rental_settings.manage")).toBe(true);
    expect(roleHasPermission("ADMIN", "rental_settings.manage")).toBe(true);
    expect(roleHasPermission("MANAGER", "rental_settings.manage")).toBe(false);
    expect(roleHasPermission("TECHNICIAN", "rental_settings.manage")).toBe(false);
    expect(roleHasPermission("ACCOUNTANT", "rental_settings.manage")).toBe(false);
    expect(roleHasPermission("VIEWER", "rental_settings.manage")).toBe(false);
  });

  it("grants everyone except TECHNICIAN rental_settings.view", () => {
    for (const role of ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT", "VIEWER"] as const) {
      expect(roleHasPermission(role, "rental_settings.view")).toBe(true);
    }
    expect(roleHasPermission("TECHNICIAN", "rental_settings.view")).toBe(false);
  });
});
