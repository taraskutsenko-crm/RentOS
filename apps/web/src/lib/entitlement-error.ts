import { ApiError } from "./api-client";

interface EntitlementErrorBody {
  code?: string;
}

/** True only for a real ENTITLEMENT_DENIED response (see EntitlementDeniedException) — never for an ordinary validation/conflict error. */
export function isEntitlementDeniedError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.details as EntitlementErrorBody | undefined)?.code === "ENTITLEMENT_DENIED"
  );
}
