import type { EInvoiceConnectionStatus, EInvoiceProviderType } from "@prisma/client";

/**
 * NEVER includes `encryptedCredentials` — this is the only shape the API
 * ever returns for a connection, so a credential can never leak into a
 * frontend payload or be logged via a controller's response (see task
 * requirement — "never include them in frontend payloads unnecessarily").
 */
export interface EInvoiceConnectionView {
  provider: EInvoiceProviderType;
  status: EInvoiceConnectionStatus;
  environment: string | null;
  connectedAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
}
