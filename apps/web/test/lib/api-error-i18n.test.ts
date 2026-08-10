import { describe, expect, it } from "vitest";

import { apiErrorKey, apiErrorMessage } from "../../src/lib/api-error-i18n";
import { ApiError } from "../../src/lib/api-client";

describe("apiErrorKey", () => {
  it("maps every real TenantGuard message to the tenant-access key", () => {
    // apps/api/src/tenants/tenant.guard.ts's three ForbiddenException
    // messages, verbatim — regression coverage for a reported "Something
    // went wrong" customer-creation failure whose real cause was a stale
    // tenant context (see apps/web/src/hooks/use-ensure-tenant-context.ts),
    // not a duplicate-data rejection. Any of these should now surface a
    // real, actionable message instead of falling through to the generic
    // fallback.
    const messages = [
      "No tenant context provided",
      "You do not have access to this tenant",
      "This tenant is not available",
    ];
    for (const message of messages) {
      expect(apiErrorKey(new ApiError(message, 403))).toBe("tenant.errors.noAccess");
    }
  });

  it("still falls back to the generic key for an unrecognized error", () => {
    expect(apiErrorKey(new ApiError("Some unmapped backend message", 500))).toBe(
      "auth.errors.generic",
    );
    expect(apiErrorKey(new Error("not an ApiError"))).toBe("auth.errors.generic");
  });

  it("resolves known auth messages unaffected by the new tenant mapping", () => {
    expect(apiErrorKey(new ApiError("Invalid email or password", 401))).toBe(
      "auth.errors.invalidCredentials",
    );
    expect(apiErrorKey(new ApiError("An account with this email already exists", 409))).toBe(
      "auth.errors.emailInUse",
    );
  });
});

describe("apiErrorMessage", () => {
  it("returns the raw backend message when present", () => {
    expect(apiErrorMessage(new ApiError("You do not have access to this tenant", 403), "x")).toBe(
      "You do not have access to this tenant",
    );
  });

  it("returns the fallback for a non-ApiError", () => {
    expect(apiErrorMessage(new Error("boom"), "fallback text")).toBe("fallback text");
  });
});
