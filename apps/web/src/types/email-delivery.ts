/**
 * Shared across Document/Quote/Invoice/PaymentDemand email deliveries —
 * mirrors the backend's `EmailErrorCategory` (apps/api/src/email/email.types.ts)
 * exactly. Present only when status is FAILED; never derived from raw
 * provider/SMTP text — see email-delivery-status.ts for how the UI turns
 * this into a localized, human-readable line.
 */
export type EmailErrorCategory =
  | "AUTH_FAILED"
  | "DOMAIN_NOT_VERIFIED"
  | "SMTP_REJECTED"
  | "CONNECTION_TIMEOUT"
  | "RECIPIENT_REJECTED"
  | "ATTACHMENT_GENERATION_FAILED"
  | "PROVIDER_ERROR";
