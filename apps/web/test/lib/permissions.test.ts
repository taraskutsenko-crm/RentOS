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

  it("only OWNER/ADMIN can manage rental billing settings, but MANAGER/VIEWER can view", () => {
    expect(roleHasPermission("OWNER", "rental_settings.manage")).toBe(true);
    expect(roleHasPermission("MANAGER", "rental_settings.manage")).toBe(false);
    expect(roleHasPermission("MANAGER", "rental_settings.view")).toBe(true);
    expect(roleHasPermission("VIEWER", "rental_settings.view")).toBe(true);
    expect(roleHasPermission("TECHNICIAN", "rental_settings.view")).toBe(false);
  });

  it("grants MANAGER document lifecycle actions but not delete/manageTemplates", () => {
    expect(roleHasPermission("MANAGER", "documents.send")).toBe(true);
    expect(roleHasPermission("MANAGER", "documents.sign")).toBe(true);
    expect(roleHasPermission("MANAGER", "documents.delete")).toBe(false);
    expect(roleHasPermission("MANAGER", "documents.manageTemplates")).toBe(false);
  });

  it("grants TECHNICIAN view/create/update/download/sign but not send", () => {
    expect(roleHasPermission("TECHNICIAN", "documents.create")).toBe(true);
    expect(roleHasPermission("TECHNICIAN", "documents.send")).toBe(false);
    // Havelio Signature System: TECHNICIAN physically performs
    // Handover/Return, so it can capture an in-person signature directly.
    expect(roleHasPermission("TECHNICIAN", "documents.sign")).toBe(true);
  });

  it("restricts VIEWER to documents.view/documents.download", () => {
    expect(roleHasPermission("VIEWER", "documents.view")).toBe(true);
    expect(roleHasPermission("VIEWER", "documents.download")).toBe(true);
    expect(roleHasPermission("VIEWER", "documents.create")).toBe(false);
  });

  it("grants MANAGER render/share but not documents.templates.manage (TASK-0008 Part 2)", () => {
    expect(roleHasPermission("MANAGER", "documents.render")).toBe(true);
    expect(roleHasPermission("MANAGER", "documents.share")).toBe(true);
    expect(roleHasPermission("MANAGER", "documents.templates.manage")).toBe(false);
    expect(roleHasPermission("OWNER", "documents.templates.manage")).toBe(true);
  });

  it("grants TECHNICIAN documents.render only, not sharing or template management", () => {
    expect(roleHasPermission("TECHNICIAN", "documents.render")).toBe(true);
    expect(roleHasPermission("TECHNICIAN", "documents.share")).toBe(false);
    expect(roleHasPermission("TECHNICIAN", "documents.templates.manage")).toBe(false);
  });
});
