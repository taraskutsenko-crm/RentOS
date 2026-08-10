import { ApiError } from "./api-client";

/** Maps known backend error messages to translation keys. */
const KNOWN_MESSAGES: Record<string, string> = {
  "Invalid email or password": "auth.errors.invalidCredentials",
  "This account is inactive": "auth.errors.accountInactive",
  "An account with this email already exists": "auth.errors.emailInUse",
  // TenantGuard (apps/api/src/tenants/tenant.guard.ts) — normally
  // unreachable now that AppLayout's useEnsureTenantContext() keeps the
  // selected tenant valid before any tenant-scoped request goes out, but a
  // membership revoked mid-session (or a request in flight during the
  // correction) can still surface one of these.
  "No tenant context provided": "tenant.errors.noAccess",
  "You do not have access to this tenant": "tenant.errors.noAccess",
  "This tenant is not available": "tenant.errors.noAccess",
};

export function apiErrorKey(error: unknown): string {
  if (error instanceof ApiError) {
    return KNOWN_MESSAGES[error.message] ?? "auth.errors.generic";
  }
  return "auth.errors.generic";
}

/**
 * For modules (e.g. Assets) whose backend validation/conflict messages are
 * numerous and already human-readable — shows the raw message instead of
 * forcing every distinct error through a translation-key map.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message) {
    return error.message;
  }
  return fallback;
}
