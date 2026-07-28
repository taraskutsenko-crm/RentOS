import { describe, expect, it } from "vitest";

import { ASSET_PERMISSIONS, ROLE_PERMISSIONS, roleHasPermission } from "./permission";

describe("ROLE_PERMISSIONS", () => {
  it("grants OWNER and ADMIN every permission", () => {
    for (const permission of ASSET_PERMISSIONS) {
      expect(ROLE_PERMISSIONS.OWNER).toContain(permission);
      expect(ROLE_PERMISSIONS.ADMIN).toContain(permission);
    }
  });

  it("restricts ACCOUNTANT and VIEWER to read-only permissions", () => {
    for (const role of ["ACCOUNTANT", "VIEWER"] as const) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(permission.endsWith(".read")).toBe(true);
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

  it("every role maps to at least assets.read", () => {
    for (const role of Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]) {
      expect(roleHasPermission(role, "assets.read")).toBe(true);
    }
  });
});
