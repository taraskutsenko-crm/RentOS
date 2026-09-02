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
  // PermissionsGuard (apps/api/src/permissions/permissions.guard.ts) — the
  // one message thrown for every 403 permission-denied response app-wide.
  "You do not have permission to perform this action": "auth.errors.permissionDenied",
  // JwtAuthGuard/CustomerAuthGuard 401 messages — the global session-expiry
  // redirect (see session-expiry.ts/query-provider.tsx) is the primary fix
  // for these (the user never sees this text at all, they're redirected to
  // a friendly login banner first); mapped here too as defense in depth for
  // any caller that reads `apiErrorKey` directly instead of going through
  // the global handler.
  "Authentication required": "auth.errors.sessionExpired",
  "Invalid or expired session": "auth.errors.sessionExpired",
  "Account is no longer active": "auth.errors.sessionExpired",
  "Portal authentication required": "auth.errors.sessionExpired",
  "Portal account is no longer active": "auth.errors.sessionExpired",
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
