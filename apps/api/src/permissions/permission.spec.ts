import { describe, expect, it } from "vitest";

import {
  ALL_PERMISSIONS,
  DOCUMENT_PERMISSIONS,
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

  it("restricts VIEWER to read-only permissions", () => {
    // .download is included as read-only-safe: retrieving a generated PDF
    // never mutates anything, unlike every other quotes.* permission.
    for (const permission of ROLE_PERMISSIONS.VIEWER) {
      expect(
        permission.endsWith(".read") ||
          permission.endsWith(".view") ||
          permission.endsWith(".download"),
      ).toBe(true);
    }
  });

  it("restricts ACCOUNTANT to read-only everywhere except invoicing/payments/deposits/finance-export (its real operational job)", () => {
    const invoicingException = [
      "invoices.create",
      "invoices.update",
      "invoices.issue",
      "invoices.send",
      "invoices.cancel",
      "payments.record",
      "payments.void",
      "payment_demands.create",
      "payment_demands.send",
      "rentals.manage_deposit",
      // Financial Reports & Analytics V1 — downloading a CSV/XLSX/PDF copy
      // of tenant financial data is a real operational action for this
      // role, same tier as its other export-adjacent grants above.
      "finance.export",
    ];
    for (const permission of ROLE_PERMISSIONS.ACCOUNTANT) {
      const isReadOnly =
        permission.endsWith(".read") ||
        permission.endsWith(".view") ||
        permission.endsWith(".download");
      expect(isReadOnly || invoicingException.includes(permission)).toBe(true);
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

  it("does not grant MANAGER documents.delete or documents.manageTemplates", () => {
    expect(roleHasPermission("MANAGER", "documents.delete")).toBe(false);
    expect(roleHasPermission("MANAGER", "documents.manageTemplates")).toBe(false);
    expect(roleHasPermission("OWNER", "documents.delete")).toBe(true);
    expect(roleHasPermission("OWNER", "documents.manageTemplates")).toBe(true);
  });

  it("grants MANAGER render/share/templates.view but not documents.templates.manage (TASK-0008 Part 2)", () => {
    expect(roleHasPermission("MANAGER", "documents.render")).toBe(true);
    expect(roleHasPermission("MANAGER", "documents.share")).toBe(true);
    expect(roleHasPermission("MANAGER", "documents.templates.view")).toBe(true);
    expect(roleHasPermission("MANAGER", "documents.templates.manage")).toBe(false);
    expect(roleHasPermission("OWNER", "documents.templates.manage")).toBe(true);
  });

  it("grants TECHNICIAN documents.render only, not template management or sharing", () => {
    expect(roleHasPermission("TECHNICIAN", "documents.render")).toBe(true);
    expect(roleHasPermission("TECHNICIAN", "documents.share")).toBe(false);
    expect(roleHasPermission("TECHNICIAN", "documents.templates.manage")).toBe(false);
    expect(roleHasPermission("TECHNICIAN", "documents.templates.view")).toBe(false);
  });

  it("grants ACCOUNTANT and VIEWER documents.templates.view (read-only) but not render/share", () => {
    for (const role of ["ACCOUNTANT", "VIEWER"] as const) {
      expect(roleHasPermission(role, "documents.templates.view")).toBe(true);
      expect(roleHasPermission(role, "documents.render")).toBe(false);
      expect(roleHasPermission(role, "documents.share")).toBe(false);
    }
  });

  it("grants MANAGER full document lifecycle control except delete/manageTemplates", () => {
    for (const permission of [
      "documents.view",
      "documents.create",
      "documents.update",
      "documents.send",
      "documents.sign",
      "documents.void",
      "documents.archive",
      "documents.download",
    ] as const) {
      expect(roleHasPermission("MANAGER", permission)).toBe(true);
    }
  });

  it("grants TECHNICIAN view/create/update/download/sign but not send/void/archive", () => {
    for (const permission of [
      "documents.view",
      "documents.create",
      "documents.update",
      "documents.download",
      // Havelio Signature System (docs/PRODUCT_BIBLE.md): TECHNICIAN
      // physically performs Handover/Return, so it can capture an
      // in-person customer signature (and its own representative
      // signature) directly, without needing send/void/archive.
      "documents.sign",
    ] as const) {
      expect(roleHasPermission("TECHNICIAN", permission)).toBe(true);
    }
    for (const permission of [
      "documents.send",
      "documents.void",
      "documents.archive",
      "documents.delete",
      "documents.manageTemplates",
    ] as const) {
      expect(roleHasPermission("TECHNICIAN", permission)).toBe(false);
    }
  });

  it("restricts ACCOUNTANT and VIEWER to documents.view/documents.download", () => {
    for (const role of ["ACCOUNTANT", "VIEWER"] as const) {
      expect(roleHasPermission(role, "documents.view")).toBe(true);
      expect(roleHasPermission(role, "documents.download")).toBe(true);
      expect(roleHasPermission(role, "documents.send")).toBe(false);
      expect(roleHasPermission(role, "documents.create")).toBe(false);
    }
  });

  it("every permission in DOCUMENT_PERMISSIONS is included in ALL_PERMISSIONS", () => {
    for (const permission of DOCUMENT_PERMISSIONS) {
      expect(ALL_PERMISSIONS).toContain(permission);
    }
  });

  it("grants ACCOUNTANT and MANAGER full operational invoice/payment control", () => {
    for (const role of ["ACCOUNTANT", "MANAGER"] as const) {
      for (const permission of [
        "invoices.view",
        "invoices.create",
        "invoices.update",
        "invoices.issue",
        "invoices.send",
        "invoices.cancel",
        "invoices.download",
        "payments.view",
        "payments.record",
      ] as const) {
        expect(roleHasPermission(role, permission)).toBe(true);
      }
    }
  });

  it("grants TECHNICIAN no invoice, payment, or bank-account permissions at all", () => {
    for (const permission of [
      "invoices.view",
      "invoices.create",
      "payments.view",
      "payments.record",
      "bankAccounts.view",
    ] as const) {
      expect(roleHasPermission("TECHNICIAN", permission)).toBe(false);
    }
  });

  it("only OWNER/ADMIN can manage bank accounts or e-invoice integrations", () => {
    for (const permission of ["bankAccounts.manage", "integrations.manage"] as const) {
      expect(roleHasPermission("OWNER", permission)).toBe(true);
      expect(roleHasPermission("ADMIN", permission)).toBe(true);
      expect(roleHasPermission("MANAGER", permission)).toBe(false);
      expect(roleHasPermission("ACCOUNTANT", permission)).toBe(false);
      expect(roleHasPermission("TECHNICIAN", permission)).toBe(false);
      expect(roleHasPermission("VIEWER", permission)).toBe(false);
    }
  });

  it("VIEWER can see invoices/payments/bank accounts but never mutate them", () => {
    expect(roleHasPermission("VIEWER", "invoices.view")).toBe(true);
    expect(roleHasPermission("VIEWER", "invoices.download")).toBe(true);
    expect(roleHasPermission("VIEWER", "payments.view")).toBe(true);
    expect(roleHasPermission("VIEWER", "bankAccounts.view")).toBe(true);
    expect(roleHasPermission("VIEWER", "invoices.create")).toBe(false);
    expect(roleHasPermission("VIEWER", "payments.record")).toBe(false);
  });
});
