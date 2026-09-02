import { ApiError } from "./api-client";

/**
 * Task F: distinguishes a real session expiry (a 401 from an
 * already-authenticated area of the app — the JWT guard's "Authentication
 * required"/"Invalid or expired session"/"Account is no longer active") from
 * a 401 that is itself the *expected* outcome of a credential-entry
 * endpoint (wrong email/password on the login form) — the latter must never
 * redirect the user away from the very form reporting it. See
 * jwt-auth.guard.ts / customer-auth.guard.ts (backend) for the messages this
 * replaces with a friendly UI.
 *
 * 401 only, never 403 (see F3 — a permission-denied response is a fact
 * about the *current, still-valid* session, not an expired one).
 */
const CREDENTIAL_ENDPOINT_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
  "/portal/auth/login",
  "/portal/auth/activate-invitation",
  "/portal/auth/refresh",
  "/portal/auth/logout",
];

/** Public, unauthenticated routes never have a staff/customer session to expire. */
const PUBLIC_PATH_PREFIXES = ["/public/", "/quote/", "/share/"];

export function isSessionExpiredError(error: unknown): error is ApiError {
  if (!(error instanceof ApiError) || error.statusCode !== 401) return false;
  if (CREDENTIAL_ENDPOINT_PATHS.some((path) => error.path === path)) return false;
  if (PUBLIC_PATH_PREFIXES.some((prefix) => error.path.startsWith(prefix))) return false;
  return true;
}

/** Which login screen to send the user back to, based on which area of the app the expired request belongs to. */
export function loginPathForSessionExpiry(path: string): string {
  return path.startsWith("/portal/") ? "/portal/login" : "/login";
}

const SESSION_EXPIRED_REASON = "session_expired";

/** Builds the login URL a global 401 handler redirects to — preserves where the user was headed (`returnTo`) and why they're back here (`reason`), both read by the login page/form (see LoginForm/PortalLoginForm). */
export function buildSessionExpiredLoginUrl(failedRequestPath: string, currentLocation: string): string {
  const loginPath = loginPathForSessionExpiry(failedRequestPath);
  const params = new URLSearchParams({ reason: SESSION_EXPIRED_REASON });
  if (currentLocation && currentLocation !== loginPath) {
    params.set("returnTo", currentLocation);
  }
  return `${loginPath}?${params.toString()}`;
}

export function isSessionExpiredReason(reason: string | null): boolean {
  return reason === SESSION_EXPIRED_REASON;
}

/**
 * A safe post-login redirect target: only ever a same-origin relative path
 * (starts with a single `/`, never `//` or an absolute URL) — never trusts
 * `returnTo` blindly, which would otherwise be an open-redirect vector
 * (e.g. `?returnTo=https://evil.example`).
 */
export function sanitizeReturnTo(returnTo: string | null, fallback: string): string {
  if (!returnTo) return fallback;
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return fallback;
  return returnTo;
}
