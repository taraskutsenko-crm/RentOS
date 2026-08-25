import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import InvoiceDetailPage from "../../src/app/app/invoices/[id]/page";
import { renderWithProviders } from "../test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: "invoice-1" }),
}));

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const usePermissionMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  usePermission: (...args: unknown[]) => usePermissionMock(...args),
}));

const useCustomersMock = vi.fn();
vi.mock("../../src/hooks/use-customers", () => ({
  useCustomers: (...args: unknown[]) => useCustomersMock(...args),
}));

const useBankAccountsMock = vi.fn();
vi.mock("../../src/hooks/use-bank-accounts", () => ({
  useBankAccounts: (...args: unknown[]) => useBankAccountsMock(...args),
}));

const usePaymentsMock = vi.fn();
const useRecordPaymentMock = vi.fn();
vi.mock("../../src/hooks/use-payments", () => ({
  usePayments: (...args: unknown[]) => usePaymentsMock(...args),
  useRecordPayment: () => useRecordPaymentMock(),
}));

const useInvoiceMock = vi.fn();
const useUpdateInvoiceMock = vi.fn();
const useIssueInvoiceMock = vi.fn();
const useSendInvoiceMock = vi.fn();
const useCancelInvoiceMock = vi.fn();
vi.mock("../../src/hooks/use-invoices", () => ({
  useInvoice: (...args: unknown[]) => useInvoiceMock(...args),
  useUpdateInvoice: () => useUpdateInvoiceMock(),
  useIssueInvoice: () => useIssueInvoiceMock(),
  useSendInvoice: () => useSendInvoiceMock(),
  useCancelInvoice: () => useCancelInvoiceMock(),
  invoicePdfUrl: () => "https://example.com/invoice.pdf",
}));

function baseInvoice(status: string) {
  return {
    id: "invoice-1",
    tenantId: "tenant-1",
    invoiceNumber: "DRAFT-000001",
    type: "STANDARD",
    status,
    issueDate: "2026-08-01T00:00:00Z",
    saleDate: null,
    dueDate: null,
    sentAt: null,
    currency: "USD",
    documentLanguage: "en",
    customerId: "customer-1",
    rentalId: null,
    sourceQuoteId: null,
    bankAccountId: null,
    sellerSnapshot: {},
    buyerSnapshot: {},
    bankSnapshot: null,
    subtotalMinor: 10000,
    discountMinor: 0,
    taxMinor: 0,
    totalMinor: 10000,
    paidMinor: 0,
    remainingMinor: 10000,
    preferredPaymentMethod: null,
    paymentReference: null,
    notes: null,
    eInvoiceStatus: "NOT_SENT",
    eInvoiceReferenceNumber: null,
    eInvoiceSubmittedAt: null,
    eInvoiceProcessedAt: null,
    eInvoiceError: null,
    createdByUserId: "user-1",
    updatedByUserId: null,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    items: [
      {
        id: "item-1",
        description: "Generator A",
        quantity: 1,
        unit: null,
        unitNetPriceMinor: 10000,
        discountMinor: 0,
        taxRateBp: 0,
        netTotalMinor: 10000,
        taxTotalMinor: 0,
        grossTotalMinor: 10000,
        sortOrder: 0,
        sourceRentalItemId: null,
      },
    ],
    customer: { id: "customer-1", firstName: "Jane", lastName: "Doe", company: null },
    rental: null,
    bankAccount: null,
  };
}

describe("InvoiceDetailPage", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    usePermissionMock.mockReturnValue(true);
    useCustomersMock.mockReturnValue({ data: { items: [] } });
    useBankAccountsMock.mockReturnValue({ data: [] });
    usePaymentsMock.mockReturnValue({ data: [] });
    useRecordPaymentMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useIssueInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useSendInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useCancelInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  // Regression: "Invoice Save button does nothing" — the mutation always
  // worked, but gave zero visible feedback on success (see DECISIONS.md).
  it("shows a saved confirmation after clicking Save on a DRAFT invoice", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(baseInvoice("DRAFT"));
    useUpdateInvoiceMock.mockReturnValue({ mutateAsync, isPending: false });
    useInvoiceMock.mockReturnValue({ data: baseInvoice("DRAFT"), isLoading: false });

    const user = userEvent.setup();
    renderWithProviders(<InvoiceDetailPage />);

    expect(screen.queryByText("Invoice saved")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Invoice saved")).toBeInTheDocument();
  });

  it("shows an error instead of the saved confirmation when the save fails", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error("Network error"));
    useUpdateInvoiceMock.mockReturnValue({ mutateAsync, isPending: false });
    useInvoiceMock.mockReturnValue({ data: baseInvoice("DRAFT"), isLoading: false });

    const user = userEvent.setup();
    renderWithProviders(<InvoiceDetailPage />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Invoice saved")).not.toBeInTheDocument();
  });

  // Regression: DRAFT vs ISSUED must be visibly distinguishable and the
  // editable Save flow must only be offered while still DRAFT.
  it("hides the editable Save flow once the invoice is ISSUED", () => {
    useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useInvoiceMock.mockReturnValue({ data: baseInvoice("ISSUED"), isLoading: false });

    renderWithProviders(<InvoiceDetailPage />);

    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.getByText("Issued")).toBeInTheDocument();
  });
});
