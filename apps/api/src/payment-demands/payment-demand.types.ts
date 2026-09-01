import type { PaymentDemandStatus } from "@prisma/client";

export interface PaymentDemandInvoiceSummary {
  id: string;
  invoiceNumber: string;
}

export interface PaymentDemandCustomerSummary {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
}

/**
 * The API-facing shape of one Payment Demand — see the Prisma model's own
 * doc comment. Every amount/date below is the frozen snapshot captured at
 * generation time, never a live re-read.
 */
export interface PaymentDemandDetailView {
  id: string;
  tenantId: string;
  customerId: string;
  invoiceId: string;
  demandNumber: string;
  status: PaymentDemandStatus;

  countryCode: string;
  documentLanguage: string;

  issueDate: string;
  originalDueDate: string | null;
  requestedDeadline: string;

  currency: string;
  originalAmountMinor: number;
  paidAmountMinor: number;
  outstandingAmountMinor: number;

  creditorSnapshot: Record<string, unknown>;
  debtorSnapshot: Record<string, unknown>;
  bankSnapshot: Record<string, unknown> | null;

  createdByUserId: string;
  createdAt: string;
  sentAt: string | null;

  invoice: PaymentDemandInvoiceSummary | null;
  customer: PaymentDemandCustomerSummary | null;
}
