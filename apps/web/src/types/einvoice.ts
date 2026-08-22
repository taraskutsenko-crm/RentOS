export type EInvoiceProviderType = "KSEF";
export type EInvoiceConnectionStatus = "NOT_CONNECTED" | "CONNECTED" | "ERROR";

export interface EInvoiceConnection {
  provider: EInvoiceProviderType;
  status: EInvoiceConnectionStatus;
  environment: string | null;
  connectedAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
}
