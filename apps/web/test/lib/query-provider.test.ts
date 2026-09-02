import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApiError } from "../../src/lib/api-client";
import { handleGlobalQueryError } from "../../src/lib/query-provider";

// Task F1/F2 — the actual wiring point: every query/mutation error in the
// app flows through this one handler (see QueryProvider's queryCache/
// mutationCache). A real session expiry redirects to a friendly login
// screen; anything else (ordinary business errors, 403s, credential-form
// 401s) is left completely alone for the calling component's own error UI.
describe("handleGlobalQueryError", () => {
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    // jsdom's window.location isn't directly assignable — replace it with
    // a minimal writable stand-in for the duration of each test.
    Object.defineProperty(window, "location", {
      value: { pathname: "/app/rentals/r1", search: "?tab=documents", href: "" },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it("redirects to the login page with the current location preserved on a real session-expiry 401", () => {
    const error = new ApiError("Authentication required", 401, "/tenants/t1/rentals");
    handleGlobalQueryError(error);

    expect(window.location.href).toBe(
      "/login?reason=session_expired&returnTo=%2Fapp%2Frentals%2Fr1%3Ftab%3Ddocuments",
    );
  });

  it("redirects to the portal login page for a portal-area session expiry", () => {
    const error = new ApiError("Portal authentication required", 401, "/portal/rentals");
    handleGlobalQueryError(error);

    expect(window.location.href).toMatch(/^\/portal\/login\?/);
  });

  it("does nothing for a 403 permission-denied error (never treated as session expiry)", () => {
    const error = new ApiError("You do not have permission to perform this action", 403, "/tenants/t1/rentals");
    handleGlobalQueryError(error);

    expect(window.location.href).toBe("");
  });

  it("does nothing for a 401 from the login endpoint itself", () => {
    const error = new ApiError("Invalid email or password", 401, "/auth/login");
    handleGlobalQueryError(error);

    expect(window.location.href).toBe("");
  });

  it("does nothing for an ordinary non-ApiError", () => {
    handleGlobalQueryError(new Error("network exploded"));
    expect(window.location.href).toBe("");
  });
});
