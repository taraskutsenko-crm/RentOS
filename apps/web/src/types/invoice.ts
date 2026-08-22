export type InvoiceType = "STANDARD" | "PROFORMA" | "CORRECTION";
export type InvoiceStatus =
  "DRAFT" | "ISSUED" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED" | "CORRECTED";
export type EInvoiceStatus = "NOT_SENT" | "PENDING" | "ACCEPTED" | "REJECTED" | "ERROR";
export type PaymentMethod = "BANK_TRANSFER" | "CASH" | "CARD" | "OTHER";

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
  createdByUserId: string;
  createdAt: string;
}
