import { describe, expect, it } from "vitest";

import { ApiError } from "../../src/lib/api-client";
import {
  buildSessionExpiredLoginUrl,
  isSessionExpiredError,
  isSessionExpiredReason,
  loginPathForSessionExpiry,
  sanitizeReturnTo,
} from "../../src/lib/session-expiry";

describe("isSessionExpiredError", () => {
  it("is true for a 401 from an ordinary, already-authenticated app request", () => {
    const error = new ApiError("Authentication required", 401, "/tenants/t1/rentals");
    expect(isSessionExpiredError(error)).toBe(true);
  });

  it("is true for the customer portal's own 401 messages", () => {
    expect(isSessionExpiredError(new ApiError("Portal authentication required", 401, "/portal/rentals"))).toBe(
      true,
    );
  });

  // Task F3 — 401 != 403. A permission-denied response is a fact about the
  // current, still-valid session, never a reason to sign the user out.
  it("is false for a 403 (permission denied) — never confused with session expiry", () => {
    const error = new ApiError("You do not have permission to perform this action", 403, "/tenants/t1/rentals");
    expect(isSessionExpiredError(error)).toBe(false);
  });

  it("is false for a non-ApiError", () => {
    expect(isSessionExpiredError(new Error("boom"))).toBe(false);
  });

  it("is false for a 401 from the login endpoint itself (wrong password is an expected outcome, not a session expiry)", () => {
    const error = new ApiError("Invalid email or password", 401, "/auth/login");
    expect(isSessionExpiredError(error)).toBe(false);
  });

  it("is false for a 401 from register/refresh/logout, and the portal's equivalents", () => {
    for (const path of [
      "/auth/register",
      "/auth/refresh",
      "/auth/logout",
      "/portal/auth/login",
      "/portal/auth/activate-invitation",
      "/portal/auth/refresh",
      "/portal/auth/logout",
    ]) {
      expect(isSessionExpiredError(new ApiError("x", 401, path))).toBe(false);
    }
  });

  it("is false for a public/unauthenticated share-link route (no session to expire)", () => {
    expect(isSessionExpiredError(new ApiError("x", 401, "/public/documents/tok/pdf"))).toBe(false);
  });
});

describe("loginPathForSessionExpiry", () => {
  it("sends a portal-area request back to /portal/login", () => {
    expect(loginPathForSessionExpiry("/portal/rentals")).toBe("/portal/login");
  });

  it("sends a staff-area request back to /login", () => {
    expect(loginPathForSessionExpiry("/tenants/t1/rentals")).toBe("/login");
  });
});

describe("buildSessionExpiredLoginUrl", () => {
  it("builds a staff login URL carrying the reason and the current location as returnTo", () => {
    const url = buildSessionExpiredLoginUrl("/tenants/t1/rentals", "/app/rentals/r1?tab=documents");
    expect(url).toBe("/login?reason=session_expired&returnTo=%2Fapp%2Frentals%2Fr1%3Ftab%3Ddocuments");
  });

  it("builds a portal login URL for a portal-area failure", () => {
    const url = buildSessionExpiredLoginUrl("/portal/rentals", "/portal/rentals/r1");
    expect(url).toBe("/portal/login?reason=session_expired&returnTo=%2Fportal%2Frentals%2Fr1");
  });

  it("omits returnTo when the current location already is the login page (avoids a pointless self-referential returnTo)", () => {
    const url = buildSessionExpiredLoginUrl("/tenants/t1/rentals", "/login");
    expect(url).toBe("/login?reason=session_expired");
  });
});

describe("isSessionExpiredReason", () => {
  it("recognizes the exact reason value the redirect sets", () => {
    expect(isSessionExpiredReason("session_expired")).toBe(true);
  });

  it("is false for null or any other value", () => {
    expect(isSessionExpiredReason(null)).toBe(false);
    expect(isSessionExpiredReason("something_else")).toBe(false);
  });
});

describe("sanitizeReturnTo", () => {
  it("accepts a same-origin relative path", () => {
    expect(sanitizeReturnTo("/app/rentals/r1", "/app")).toBe("/app/rentals/r1");
  });

  it("falls back for a missing value", () => {
    expect(sanitizeReturnTo(null, "/app")).toBe("/app");
    expect(sanitizeReturnTo("", "/app")).toBe("/app");
  });

  // Open-redirect protection: never trust returnTo as an absolute or
  // protocol-relative URL.
  it("falls back for an absolute external URL", () => {
    expect(sanitizeReturnTo("https://evil.example/phish", "/app")).toBe("/app");
  });

  it("falls back for a protocol-relative URL (//evil.example)", () => {
    expect(sanitizeReturnTo("//evil.example/phish", "/app")).toBe("/app");
  });

  it("falls back for a value that doesn't start with a slash", () => {
    expect(sanitizeReturnTo("javascript:alert(1)", "/app")).toBe("/app");
  });
});
