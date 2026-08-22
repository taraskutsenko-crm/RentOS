import { describe, expect, it, vi } from "vitest";

import { getAssetStatusLabel } from "../../src/lib/asset-status-label";

const t = vi.fn((key: string) => `translated:${key}`) as unknown as (key: string) => string;

describe("getAssetStatusLabel", () => {
  it("translates a system status by its immutable code, not its stored (possibly renamed) name", () => {
    const label = getAssetStatusLabel(t as never, {
      code: "AVAILABLE",
      name: "Available", // seeded default -- happens to match, but code drives the label either way
      isSystem: true,
    });
    expect(label).toBe("translated:asset.statuses.AVAILABLE");
  });

  it("still translates a system status by code even if the tenant renamed it", () => {
    const label = getAssetStatusLabel(t as never, {
      code: "MAINTENANCE",
      name: "Serwis techniczny", // tenant-edited display name -- code is what stays stable
      isSystem: true,
    });
    expect(label).toBe("translated:asset.statuses.MAINTENANCE");
  });

  it("renders the literal stored name for a custom, tenant-created status (no translation exists)", () => {
    const label = getAssetStatusLabel(t as never, {
      code: "ON_LOAN_TO_PARTNER",
      name: "On loan to partner",
      isSystem: false,
    });
    expect(label).toBe("On loan to partner");
  });

  it("falls back to the stored name for an unrecognized code even if isSystem is somehow true", () => {
    const label = getAssetStatusLabel(t as never, {
      code: "SOME_FUTURE_CODE",
      name: "Some Future Code",
      isSystem: true,
    });
    expect(label).toBe("Some Future Code");
  });

  it.each([
    "AVAILABLE",
    "RESERVED",
    "RENTED",
    "INSPECTION_REQUIRED",
    "MAINTENANCE",
    "REPAIR",
    "LOST",
    "RETIRED",
  ])("translates every one of the eight seeded system status codes (%s)", (code) => {
    const label = getAssetStatusLabel(t as never, { code, name: code, isSystem: true });
    expect(label).toBe(`translated:asset.statuses.${code}`);
  });
});
