export type InvoiceType = "STANDARD" | "PROFORMA" | "CORRECTION";
export type InvoiceStatus =
  "DRAFT" | "ISSUED" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED" | "CORRECTED";
export type EInvoiceStatus = "NOT_SENT" | "PENDING" | "ACCEPTED" | "REJECTED" | "ERROR";
export type PaymentMethod = "BANK_TRANSFER" | "CASH" | "CARD" | "OTHER";

/**
 * Havelio Payments & Receivables — a derived read model, independent of
 * `InvoiceStatus` (see apps/api/src/payments/payment-status.util.ts).
 * Never persisted, never manually set — only ever computed server-side.
 */
export type PaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "PARTIALLY_PAID_OVERDUE";

export interface InvoiceItem {
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

export interface Invoice {
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

  sellerSnapshot: Record<string, string>;
  buyerSnapshot: Record<string, string>;
  bankSnapshot: Record<string, string> | null;

  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  remainingMinor: number;

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

  items: InvoiceItem[];
  customer: InvoiceCustomerSummary | null;
  rental: InvoiceRentalSummary | null;
  bankAccount: InvoiceBankAccountSummary | null;
}

export interface PaginatedInvoices {
  data: Invoice[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** PENDING/SENT/FAILED/NOT_CONFIGURED — same truthful shape as Document/Quote email delivery (see DECISIONS.md production-infrastructure pass). */
export interface InvoiceEmailDelivery {
  id: string;
  invoiceId: string;
  recipientEmail: string;
  subject: string;
  message: string | null;
  status: "PENDING" | "SENT" | "FAILED" | "NOT_CONFIGURED";
  errorMessage: string | null;
  providerMessageId: string | null;
  createdAt: string;
  sentAt: string | null;
  failedAt: string | null;
}

export interface Payment {
  id: string;
  tenantId: string;
  invoiceId: string;
  amountMinor: number;
  currency: string;
  paymentDate: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  sourceRentalDepositId: string | null;
  voidedAt: string | null;
  voidedByUserId: string | null;
  voidReason: string | null;
  createdByUserId: string;
  createdAt: string;
}

export type PaymentDemandStatus = "GENERATED" | "SENT";

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

/** Havelio International Payment Demand Foundation — a country-aware formal collection notice (Poland's "Wezwanie do zapłaty" is only the first localized template). */
export interface PaymentDemand {
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
  createdByUserId: string;
  createdAt: string;
  sentAt: string | null;
  invoice: PaymentDemandInvoiceSummary | null;
  customer: PaymentDemandCustomerSummary | null;
}

/** Mirrors InvoiceEmailDelivery's shape exactly. */
export interface PaymentDemandEmailDelivery {
  id: string;
  paymentDemandId: string;
  recipientEmail: string;
  subject: string;
  message: string | null;
  status: "PENDING" | "SENT" | "FAILED" | "NOT_CONFIGURED";
  errorMessage: string | null;
  providerMessageId: string | null;
  createdAt: string;
  sentAt: string | null;
  failedAt: string | null;
}
