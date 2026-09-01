import type {
  EInvoiceStatus,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  InvoiceType,
  PaymentMethod,
} from "@prisma/client";

import type { PaymentStatus } from "../payments/payment-status.util";

export interface InvoiceItemView {
  id: string;
  description: string;
  quantity: number;
  unit: string | null;
  unitNetPriceMinor: number;
  discountMinor: number;
  taxRateBp: number;
  netTotalMinor: number;
  taxTotalMinor: number;
  grossTotalMinor: number;
  sortOrder: number;
  sourceRentalItemId: string | null;
}

export interface InvoiceCustomerSummary {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
}

export interface InvoiceRentalSummary {
  id: string;
  rentalNumber: string;
}

export interface InvoiceBankAccountSummary {
  id: string;
  label: string;
  iban: string | null;
  swiftBic: string | null;
  currency: string;
}

/**
 * The API-facing shape of one Invoice — includes derived, never-stored
 * `paidMinor`/`remainingMinor` (summed live from Payment rows, see
 * PaymentsService/InvoicesService.sumPayments — never inferred merely
 * because the Invoice exists, per docs/DECISIONS.md).
 */
export interface InvoiceDetailView {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  type: InvoiceType;
  status: InvoiceStatus;
  issueDate: string;
  saleDate: string | null;
  dueDate: string | null;
  sentAt: string | null;
  currency: string;
  documentLanguage: string;

  customerId: string;
  rentalId: string | null;
  sourceQuoteId: string | null;
  bankAccountId: string | null;

  sellerSnapshot: Record<string, unknown>;
  buyerSnapshot: Record<string, unknown>;
  bankSnapshot: Record<string, unknown> | null;

  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  remainingMinor: number;

  /**
   * Havelio Payments & Receivables — a derived read model computed live
   * from (totalMinor, paidMinor, dueDate) on every read, never stored (see
   * apps/api/src/payments/payment-status.util.ts). Deliberately separate
   * from `status` (InvoiceStatus — the persisted business-lifecycle field):
   * `paymentStatus` only ever answers "how much has been paid, and is it
   * overdue," independent of DRAFT/ISSUED/SENT/CANCELLED/CORRECTED.
   */
  paymentStatus: PaymentStatus;
  percentagePaid: number;
  isOverdue: boolean;
  overdueDays: number;
  overdueAmountMinor: number;

  preferredPaymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  notes: string | null;

  eInvoiceStatus: EInvoiceStatus;
  eInvoiceReferenceNumber: string | null;
  eInvoiceSubmittedAt: string | null;
  eInvoiceProcessedAt: string | null;
  eInvoiceError: string | null;

  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;

  items: InvoiceItemView[];
  customer: InvoiceCustomerSummary | null;
  rental: InvoiceRentalSummary | null;
  bankAccount: InvoiceBankAccountSummary | null;
}

export type InvoiceWithRelations = Invoice & {
  items: InvoiceItem[];
  customer: InvoiceCustomerSummary | null;
  rental: InvoiceRentalSummary | null;
  bankAccount: InvoiceBankAccountSummary | null;
};

export interface PaginatedInvoices {
  data: InvoiceDetailView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
