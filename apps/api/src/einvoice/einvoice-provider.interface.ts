import type { EInvoiceStatus } from "@prisma/client";

import type { InvoiceDetailView } from "../invoices/invoice.types";

export interface EInvoiceConnectionTestResult {
  connected: boolean;
  errorMessage: string | null;
}

export interface EInvoiceSubmissionResult {
  externalReferenceNumber: string;
  submittedAt: Date;
}

export interface EInvoiceStatusResult {
  status: EInvoiceStatus;
  processedAt: Date | null;
  errorMessage: string | null;
}

/**
 * The country-neutral boundary every e-invoice compliance system (Poland's
 * KSeF, and any future country) integrates through — the generic Invoice
 * domain/service NEVER calls a provider-specific class directly, only this
 * interface (see docs/DECISIONS.md, "provider-neutral architecture").
 * `credentials` is always the DECRYPTED plaintext for the duration of one
 * call only — callers must never log it, persist it outside
 * EInvoiceConnection.encryptedCredentials, or include it in any response.
 *
 * External identifiers returned by `submitInvoice` are stored on
 * `Invoice.eInvoiceReferenceNumber` — always separate from
 * `Invoice.invoiceNumber`, Havelio's own number (see task requirement
 * "store external identifiers separately from Havelio's own invoice
 * number").
 */
export interface EInvoiceProvider {
  testConnection(credentials: string, environment: string): Promise<EInvoiceConnectionTestResult>;
  submitInvoice(
    invoice: InvoiceDetailView,
    credentials: string,
    environment: string,
  ): Promise<EInvoiceSubmissionResult>;
  checkSubmissionStatus(
    externalReferenceNumber: string,
    credentials: string,
    environment: string,
  ): Promise<EInvoiceStatusResult>;
}
