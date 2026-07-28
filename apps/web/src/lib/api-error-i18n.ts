import { ApiError } from "./api-client";

/** Maps known backend error messages to translation keys. */
const KNOWN_MESSAGES: Record<string, string> = {
  "Invalid email or password": "auth.errors.invalidCredentials",
  "This account is inactive": "auth.errors.accountInactive",
  "An account with this email already exists": "auth.errors.emailInUse",
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
