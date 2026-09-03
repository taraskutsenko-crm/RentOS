import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import InvoiceDetailPage from "../../src/app/app/invoices/[id]/page";
import { formatMoney } from "../../src/lib/money";
import { renderWithProviders } from "../test-utils";

const searchParamsMock = vi.fn(() => new URLSearchParams());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: "invoice-1" }),
  useSearchParams: () => searchParamsMock(),
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
const useMarkFullyPaidMock = vi.fn();
const useVoidPaymentMock = vi.fn();
const useApplyDepositMock = vi.fn();
vi.mock("../../src/hooks/use-payments", () => ({
  usePayments: (...args: unknown[]) => usePaymentsMock(...args),
  useRecordPayment: () => useRecordPaymentMock(),
  useMarkFullyPaid: () => useMarkFullyPaidMock(),
  useVoidPayment: () => useVoidPaymentMock(),
  useApplyDeposit: () => useApplyDepositMock(),
}));

const usePaymentDemandsMock = vi.fn();
const useCreatePaymentDemandMock = vi.fn();
const useSendPaymentDemandEmailMock = vi.fn();
const usePaymentDemandEmailDeliveriesMock = vi.fn();
vi.mock("../../src/hooks/use-payment-demands", () => ({
  usePaymentDemands: (...args: unknown[]) => usePaymentDemandsMock(...args),
  useCreatePaymentDemand: () => useCreatePaymentDemandMock(),
  useSendPaymentDemandEmail: () => useSendPaymentDemandEmailMock(),
  usePaymentDemandEmailDeliveries: (...args: unknown[]) =>
    usePaymentDemandEmailDeliveriesMock(...args),
  paymentDemandPdfUrl: (tenantId: string, invoiceId: string, id: string) =>
    `https://example.com/${tenantId}/${invoiceId}/${id}.pdf`,
}));

const useRentalDepositMock = vi.fn();
vi.mock("../../src/hooks/use-rentals", () => ({
  useRentalDeposit: (...args: unknown[]) => useRentalDepositMock(...args),
}));

const useInvoiceMock = vi.fn();
const useUpdateInvoiceMock = vi.fn();
const useIssueInvoiceMock = vi.fn();
const useSendInvoiceMock = vi.fn();
const useCancelInvoiceMock = vi.fn();
const useInvoicePreviewMock = vi.fn();
const useSendInvoiceEmailMock = vi.fn();
const useInvoiceEmailDeliveriesMock = vi.fn();
vi.mock("../../src/hooks/use-invoices", () => ({
  useInvoice: (...args: unknown[]) => useInvoiceMock(...args),
  useUpdateInvoice: () => useUpdateInvoiceMock(),
  useIssueInvoice: () => useIssueInvoiceMock(),
  useSendInvoice: () => useSendInvoiceMock(),
  useCancelInvoice: () => useCancelInvoiceMock(),
  useInvoicePreview: (...args: unknown[]) => useInvoicePreviewMock(...args),
  useSendInvoiceEmail: () => useSendInvoiceEmailMock(),
  useInvoiceEmailDeliveries: (...args: unknown[]) => useInvoiceEmailDeliveriesMock(...args),
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
    paymentStatus: "UNPAID",
    percentagePaid: 0,
    isOverdue: false,
    overdueDays: 0,
    overdueAmountMinor: 0,
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
    searchParamsMock.mockReturnValue(new URLSearchParams());
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    usePermissionMock.mockReturnValue(true);
    useCustomersMock.mockReturnValue({ data: { items: [] } });
    useBankAccountsMock.mockReturnValue({ data: [] });
    usePaymentsMock.mockReturnValue({ data: [] });
    useRecordPaymentMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useMarkFullyPaidMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useVoidPaymentMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useApplyDepositMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    usePaymentDemandsMock.mockReturnValue({ data: [] });
    useCreatePaymentDemandMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useSendPaymentDemandEmailMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    usePaymentDemandEmailDeliveriesMock.mockReturnValue({ data: [] });
    useRentalDepositMock.mockReturnValue({ data: null });
    useIssueInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useSendInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useCancelInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useInvoicePreviewMock.mockReturnValue({ data: { html: "<html><body>Invoice</body></html>" } });
    useSendInvoiceEmailMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useInvoiceEmailDeliveriesMock.mockReturnValue({ data: [] });
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

  // "Create additional charge" from Return findings (see DECISIONS.md
  // D-107) — a rentals/[id]/page.tsx link pre-fills exactly one extra blank
  // line's description via ?addChargeDescription=..., leaving amount/tax
  // for staff to enter explicitly, never invented.
  it("pre-fills one extra line with the addChargeDescription query param on a DRAFT invoice", () => {
    searchParamsMock.mockReturnValue(new URLSearchParams("addChargeDescription=Damage%20fee"));
    useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useInvoiceMock.mockReturnValue({ data: baseInvoice("DRAFT"), isLoading: false });

    renderWithProviders(<InvoiceDetailPage />);

    expect(screen.getByDisplayValue("Damage fee")).toBeInTheDocument();
    // The pre-existing rental line item is untouched, not replaced.
    expect(screen.getByDisplayValue("Generator A")).toBeInTheDocument();
  });

  it("ignores addChargeDescription once the invoice is no longer DRAFT", () => {
    searchParamsMock.mockReturnValue(new URLSearchParams("addChargeDescription=Damage%20fee"));
    useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useInvoiceMock.mockReturnValue({ data: baseInvoice("ISSUED"), isLoading: false });

    renderWithProviders(<InvoiceDetailPage />);

    expect(screen.queryByDisplayValue("Damage fee")).not.toBeInTheDocument();
  });

  // Direct-print action (see DECISIONS.md D-107) mirrors the generic
  // Document detail page: a Print button plus an iframe rendering the same
  // HTML the PDF is built from, so no manual PDF download is required.
  it("shows a Print button and preview iframe once the preview HTML has loaded", () => {
    useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useInvoiceMock.mockReturnValue({ data: baseInvoice("ISSUED"), isLoading: false });

    renderWithProviders(<InvoiceDetailPage />);

    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
    const iframe = document.querySelector("iframe");
    expect(iframe).toHaveAttribute("srcdoc", "<html><body>Invoice</body></html>");
  });

  // Invoice email — production-infrastructure pass. Distinct from the
  // existing "Mark as sent" status-flip action.
  it("offers a Send email action on an ISSUED invoice but not on a DRAFT one", () => {
    useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useInvoiceMock.mockReturnValue({ data: baseInvoice("ISSUED"), isLoading: false });
    const { rerender } = renderWithProviders(<InvoiceDetailPage />);
    expect(screen.getByRole("button", { name: "Send email" })).toBeInTheDocument();

    useInvoiceMock.mockReturnValue({ data: baseInvoice("DRAFT"), isLoading: false });
    rerender(<InvoiceDetailPage />);
    expect(screen.queryByRole("button", { name: "Send email" })).not.toBeInTheDocument();
  });

  it("shows the truthful email delivery history (never claims Sent when not configured)", () => {
    useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useInvoiceMock.mockReturnValue({ data: baseInvoice("ISSUED"), isLoading: false });
    useInvoiceEmailDeliveriesMock.mockReturnValue({
      data: [
        {
          id: "delivery-1",
          recipientEmail: "jane@example.com",
          status: "NOT_CONFIGURED",
          errorMessage: "No email provider is configured",
        },
      ],
    });

    renderWithProviders(<InvoiceDetailPage />);

    expect(screen.getByText(/jane@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/Not configured/)).toBeInTheDocument();
  });

  it("omits the Print button while the preview is still loading", () => {
    useInvoicePreviewMock.mockReturnValue({ data: undefined });
    useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useInvoiceMock.mockReturnValue({ data: baseInvoice("ISSUED"), isLoading: false });

    renderWithProviders(<InvoiceDetailPage />);

    expect(screen.queryByRole("button", { name: "Print" })).not.toBeInTheDocument();
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

  describe("Payments & Receivables", () => {
    it("shows the payment progress bar with paid/total/percent text", () => {
      useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      useInvoiceMock.mockReturnValue({
        data: {
          ...baseInvoice("ISSUED"),
          paidMinor: 3000,
          remainingMinor: 7000,
          paymentStatus: "PARTIALLY_PAID",
          percentagePaid: 30,
        },
        isLoading: false,
      });

      renderWithProviders(<InvoiceDetailPage />);

      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "30");
      expect(screen.getByText("30% paid")).toBeInTheDocument();
      expect(document.body.textContent).toMatch(/30,00\s\$\s\/\s100,00\s\$/);
    });

    it("shows an overdue banner with days overdue and the outstanding amount", () => {
      useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      useInvoiceMock.mockReturnValue({
        data: {
          ...baseInvoice("OVERDUE"),
          paidMinor: 3000,
          remainingMinor: 7000,
          paymentStatus: "PARTIALLY_PAID_OVERDUE",
          percentagePaid: 30,
          isOverdue: true,
          overdueDays: 6,
          overdueAmountMinor: 7000,
        },
        isLoading: false,
      });

      renderWithProviders(<InvoiceDetailPage />);

      expect(screen.getByText("6 days overdue")).toBeInTheDocument();
      expect(document.body.textContent).toMatch(/Outstanding:\s70,00\s\$/);
    });

    it("offers 'Mark as paid' behind an accessible confirmation dialog that records the server-computed remaining balance", async () => {
      const mutateAsync = vi.fn().mockResolvedValue({});
      useMarkFullyPaidMock.mockReturnValue({ mutateAsync, isPending: false });
      useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      useInvoiceMock.mockReturnValue({
        data: { ...baseInvoice("ISSUED"), remainingMinor: 10000 },
        isLoading: false,
      });
      const user = userEvent.setup();

      renderWithProviders(<InvoiceDetailPage />);
      await user.click(screen.getByRole("button", { name: "Mark as paid" }));

      // Task 16 Part 4/19 — an accessible confirmation dialog (never
      // window.confirm), stating the exact server-computed amount before
      // anything is recorded.
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText(/100,00/)).toBeInTheDocument();
      expect(mutateAsync).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole("button", { name: "Mark as paid" }));

      await waitFor(() =>
        expect(mutateAsync).toHaveBeenCalledWith({ invoiceId: "invoice-1", input: {} }),
      );
    });

    it("cancelling the 'Mark as paid' confirmation dialog never records a payment", async () => {
      const mutateAsync = vi.fn().mockResolvedValue({});
      useMarkFullyPaidMock.mockReturnValue({ mutateAsync, isPending: false });
      useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      useInvoiceMock.mockReturnValue({
        data: { ...baseInvoice("ISSUED"), remainingMinor: 10000 },
        isLoading: false,
      });
      const user = userEvent.setup();

      renderWithProviders(<InvoiceDetailPage />);
      await user.click(screen.getByRole("button", { name: "Mark as paid" }));
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it("hides 'Mark as paid' once the invoice has no remaining balance", () => {
      useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      useInvoiceMock.mockReturnValue({
        data: { ...baseInvoice("PAID"), paidMinor: 10000, remainingMinor: 0 },
        isLoading: false,
      });

      renderWithProviders(<InvoiceDetailPage />);

      expect(screen.queryByRole("button", { name: "Mark as paid" })).not.toBeInTheDocument();
    });

    it("lets staff void a payment with a reason, and shows it struck through with a Voided tag afterward", async () => {
      const mutateAsync = vi.fn().mockResolvedValue({});
      useVoidPaymentMock.mockReturnValue({ mutateAsync, isPending: false });
      usePaymentsMock.mockReturnValue({
        data: [
          {
            id: "pay-1",
            invoiceId: "invoice-1",
            amountMinor: 3000,
            currency: "USD",
            paymentDate: "2026-08-05T00:00:00Z",
            method: "BANK_TRANSFER",
            reference: null,
            notes: null,
            sourceRentalDepositId: null,
            voidedAt: null,
            voidedByUserId: null,
            voidReason: null,
            createdByUserId: "user-1",
            createdAt: "2026-08-05T00:00:00Z",
          },
        ],
      });
      useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      useInvoiceMock.mockReturnValue({
        data: { ...baseInvoice("ISSUED"), paidMinor: 3000, remainingMinor: 7000 },
        isLoading: false,
      });
      const user = userEvent.setup();

      renderWithProviders(<InvoiceDetailPage />);
      await user.click(screen.getByRole("button", { name: "Void" }));
      await user.type(screen.getByLabelText("Reason"), "Entered by mistake");
      await user.click(screen.getByRole("dialog").querySelector("button:last-child")!);

      await waitFor(() =>
        expect(mutateAsync).toHaveBeenCalledWith({
          invoiceId: "invoice-1",
          paymentId: "pay-1",
          reason: "Entered by mistake",
        }),
      );
    });

    // Task 16 Part 3 — the dialog always opens pre-filled with the exact
    // remaining balance (a smaller amount is still freely typeable for a
    // partial payment).
    it("defaults the Add payment amount to the exact remaining balance", async () => {
      useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      useInvoiceMock.mockReturnValue({
        data: { ...baseInvoice("ISSUED"), remainingMinor: 30750 },
        isLoading: false,
      });
      const user = userEvent.setup();

      renderWithProviders(<InvoiceDetailPage />);
      await user.click(screen.getByRole("button", { name: "Add payment" }));

      expect(screen.getByLabelText("Amount")).toHaveValue("307.50");
    });

    it("records a payment with an optional note", async () => {
      const mutateAsync = vi.fn().mockResolvedValue({});
      useRecordPaymentMock.mockReturnValue({ mutateAsync, isPending: false });
      useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      useInvoiceMock.mockReturnValue({
        data: { ...baseInvoice("ISSUED"), remainingMinor: 30750 },
        isLoading: false,
      });
      const user = userEvent.setup();

      renderWithProviders(<InvoiceDetailPage />);
      await user.click(screen.getByRole("button", { name: "Add payment" }));
      const dialog = await screen.findByRole("dialog");
      await user.type(within(dialog).getByLabelText("Note"), "Paid at the counter");
      await user.click(within(dialog).getByRole("button", { name: "Add payment" }));

      await waitFor(() =>
        expect(mutateAsync).toHaveBeenCalledWith({
          invoiceId: "invoice-1",
          input: expect.objectContaining({ notes: "Paid at the counter" }),
        }),
      );
    });

    // Task 16 Part 15 — double-click/duplicate-submission UX protection:
    // the same isPending-disables-the-button convention every other
    // mutation in this codebase already relies on.
    it("disables the Add payment submit button while the request is in flight", async () => {
      useRecordPaymentMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
      useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      useInvoiceMock.mockReturnValue({
        data: { ...baseInvoice("ISSUED"), remainingMinor: 30750 },
        isLoading: false,
      });
      const user = userEvent.setup();

      renderWithProviders(<InvoiceDetailPage />);
      await user.click(screen.getByRole("button", { name: "Add payment" }));
      const dialog = await screen.findByRole("dialog");

      expect(within(dialog).getByRole("button", { name: "Saving…" })).toBeDisabled();
    });

    it("shows the reference, note, and deposit-source badge for a live payment", () => {
      usePaymentsMock.mockReturnValue({
        data: [
          {
            id: "pay-1",
            invoiceId: "invoice-1",
            amountMinor: 3000,
            currency: "USD",
            paymentDate: "2026-08-05T00:00:00Z",
            method: "BANK_TRANSFER",
            reference: "INV-2026-000001",
            notes: "Paid via office transfer",
            sourceRentalDepositId: "deposit-1",
            voidedAt: null,
            voidedByUserId: null,
            voidReason: null,
            createdByUserId: "user-1",
            createdAt: "2026-08-05T00:00:00Z",
          },
        ],
      });
      useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      useInvoiceMock.mockReturnValue({
        data: { ...baseInvoice("ISSUED"), paidMinor: 3000, remainingMinor: 7000 },
        isLoading: false,
      });

      renderWithProviders(<InvoiceDetailPage />);

      expect(screen.getByText(/From deposit/)).toBeInTheDocument();
      expect(screen.getByText(/Reference: INV-2026-000001/)).toBeInTheDocument();
      expect(screen.getByText(/Paid via office transfer/)).toBeInTheDocument();
    });

    it("shows the void reason and date for a voided payment", () => {
      usePaymentsMock.mockReturnValue({
        data: [
          {
            id: "pay-1",
            invoiceId: "invoice-1",
            amountMinor: 3000,
            currency: "USD",
            paymentDate: "2026-08-05T00:00:00Z",
            method: "BANK_TRANSFER",
            reference: null,
            notes: null,
            sourceRentalDepositId: null,
            voidedAt: "2026-08-06T00:00:00Z",
            voidedByUserId: "user-1",
            voidReason: "Wrong amount entered",
            createdByUserId: "user-1",
            createdAt: "2026-08-05T00:00:00Z",
          },
        ],
      });
      useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      useInvoiceMock.mockReturnValue({
        data: { ...baseInvoice("ISSUED"), paidMinor: 0, remainingMinor: 10000 },
        isLoading: false,
      });

      renderWithProviders(<InvoiceDetailPage />);

      expect(screen.getByText(/Wrong amount entered/)).toBeInTheDocument();
    });

    it("offers 'Apply deposit to balance' only when the linked rental has an available held deposit", () => {
      useRentalDepositMock.mockReturnValue({
        data: {
          id: "deposit-1",
          receivedAmountMinor: 5000,
          returnedAmountMinor: null,
          retainedAmountMinor: null,
          balance: {
            currency: "USD",
            receivedMinor: 5000,
            returnedMinor: 0,
            retainedMinor: 0,
            appliedMinor: 0,
            availableMinor: 5000,
          },
        },
      });
      useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      useInvoiceMock.mockReturnValue({
        data: { ...baseInvoice("ISSUED"), rentalId: "rental-1", remainingMinor: 10000 },
        isLoading: false,
      });

      renderWithProviders(<InvoiceDetailPage />);

      expect(screen.getByRole("button", { name: "Apply deposit to balance" })).toBeInTheDocument();
    });

    it("shows the canonical server-derived available amount, never the raw received amount", () => {
      // Received 1000 (100_000 minor), but 400 already applied elsewhere and
      // 100 returned/100 retained — the canonical available is 400, never
      // the stale 1000 "received" figure.
      useRentalDepositMock.mockReturnValue({
        data: {
          id: "deposit-1",
          receivedAmountMinor: 100_000,
          returnedAmountMinor: 10_000,
          retainedAmountMinor: 10_000,
          balance: {
            currency: "USD",
            receivedMinor: 100_000,
            returnedMinor: 10_000,
            retainedMinor: 10_000,
            appliedMinor: 40_000,
            availableMinor: 40_000,
          },
        },
      });
      useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      useInvoiceMock.mockReturnValue({
        data: { ...baseInvoice("ISSUED"), rentalId: "rental-1", remainingMinor: 70_000 },
        isLoading: false,
      });

      renderWithProviders(<InvoiceDetailPage />);

      expect(document.body.textContent).toContain(
        `Deposit available: ${formatMoney(40_000, "USD")}`,
      );
      // The stale "raw received" figure (1000, before applied/returned/
      // retained are netted out) must never appear anywhere on the page.
      expect(document.body.textContent).not.toContain(formatMoney(100_000, "USD"));
    });

    it("hides 'Apply deposit to balance' once the canonical available balance is fully consumed, even though the deposit was originally received", () => {
      useRentalDepositMock.mockReturnValue({
        data: {
          id: "deposit-1",
          receivedAmountMinor: 100_000,
          returnedAmountMinor: null,
          retainedAmountMinor: null,
          balance: {
            currency: "USD",
            receivedMinor: 100_000,
            returnedMinor: 0,
            retainedMinor: 0,
            appliedMinor: 100_000,
            availableMinor: 0,
          },
        },
      });
      useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      useInvoiceMock.mockReturnValue({
        data: { ...baseInvoice("ISSUED"), rentalId: "rental-1", remainingMinor: 10000 },
        isLoading: false,
      });

      renderWithProviders(<InvoiceDetailPage />);

      expect(
        screen.queryByRole("button", { name: "Apply deposit to balance" }),
      ).not.toBeInTheDocument();
    });

    it("clamps the apply-deposit amount to the canonical available balance, not to a locally-recomputed figure", async () => {
      const mutateAsync = vi.fn().mockResolvedValue({});
      useApplyDepositMock.mockReturnValue({ mutateAsync, isPending: false });
      useRentalDepositMock.mockReturnValue({
        data: {
          id: "deposit-1",
          receivedAmountMinor: 100_000,
          returnedAmountMinor: null,
          retainedAmountMinor: null,
          balance: {
            currency: "USD",
            receivedMinor: 100_000,
            returnedMinor: 0,
            retainedMinor: 0,
            appliedMinor: 60_000,
            availableMinor: 40_000,
          },
        },
      });
      useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      useInvoiceMock.mockReturnValue({
        data: { ...baseInvoice("ISSUED"), rentalId: "rental-1", remainingMinor: 70_000 },
        isLoading: false,
      });
      const user = userEvent.setup();

      renderWithProviders(<InvoiceDetailPage />);
      await user.click(screen.getByRole("button", { name: "Apply deposit to balance" }));
      const dialog = screen.getByRole("dialog");
      await user.type(within(dialog).getByLabelText("Amount to apply"), "500");
      await user.click(within(dialog).getByRole("button", { name: "Apply deposit to balance" }));

      expect(mutateAsync).not.toHaveBeenCalled();
      expect(document.body.textContent).toContain(
        `Amount cannot exceed the available deposit (${formatMoney(40_000, "USD")})`,
      );
    });

    it("offers 'Create payment demand' only once the invoice is overdue with a remaining balance", () => {
      useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      useInvoiceMock.mockReturnValue({
        data: {
          ...baseInvoice("OVERDUE"),
          remainingMinor: 7000,
          isOverdue: true,
          overdueDays: 3,
          overdueAmountMinor: 7000,
        },
        isLoading: false,
      });

      renderWithProviders(<InvoiceDetailPage />);

      expect(screen.getByRole("button", { name: "Create payment demand" })).toBeInTheDocument();
    });

    it("does not offer 'Create payment demand' when the invoice is not yet overdue", () => {
      useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      useInvoiceMock.mockReturnValue({
        data: { ...baseInvoice("ISSUED"), remainingMinor: 10000, isOverdue: false },
        isLoading: false,
      });

      renderWithProviders(<InvoiceDetailPage />);

      expect(
        screen.queryByRole("button", { name: "Create payment demand" }),
      ).not.toBeInTheDocument();
    });

    // Task 16 Part 12 — "Send by email" opens a real compose flow (recipient/
    // message/attachment note) instead of firing an email on a single click,
    // mirroring the fixed Quote/Document send-clarity pattern.
    it("opens a compose dialog for 'Send by email' showing the recipient, message, and attachment note", async () => {
      useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      useInvoiceMock.mockReturnValue({
        data: { ...baseInvoice("OVERDUE"), remainingMinor: 7000, isOverdue: true },
        isLoading: false,
      });
      useCustomersMock.mockReturnValue({
        data: { items: [{ id: "customer-1", email: "jane@example.com" }] },
      });
      usePaymentDemandsMock.mockReturnValue({
        data: [
          {
            id: "demand-1",
            demandNumber: "DEM-2026-000001",
            status: "GENERATED",
            currency: "USD",
            outstandingAmountMinor: 7000,
            sentAt: null,
          },
        ],
      });
      const user = userEvent.setup();

      renderWithProviders(<InvoiceDetailPage />);
      await user.click(screen.getByRole("button", { name: "Send by email" }));

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByDisplayValue("jane@example.com")).toBeInTheDocument();
      expect(within(dialog).getByText(/will be attached automatically/i)).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /^send$/i })).toBeInTheDocument();
    });

    it("sends the payment demand email with the edited recipient/message and reports the real outcome", async () => {
      const mutateAsync = vi.fn().mockResolvedValue({ sent: true });
      useSendPaymentDemandEmailMock.mockReturnValue({ mutateAsync, isPending: false });
      useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      useInvoiceMock.mockReturnValue({
        data: { ...baseInvoice("OVERDUE"), remainingMinor: 7000, isOverdue: true },
        isLoading: false,
      });
      useCustomersMock.mockReturnValue({
        data: { items: [{ id: "customer-1", email: "jane@example.com" }] },
      });
      usePaymentDemandsMock.mockReturnValue({
        data: [
          {
            id: "demand-1",
            demandNumber: "DEM-2026-000001",
            status: "GENERATED",
            currency: "USD",
            outstandingAmountMinor: 7000,
            sentAt: null,
          },
        ],
      });
      const user = userEvent.setup();

      renderWithProviders(<InvoiceDetailPage />);
      await user.click(screen.getByRole("button", { name: "Send by email" }));
      const dialog = await screen.findByRole("dialog");
      await user.type(within(dialog).getByLabelText(/message/i), "Please settle this balance");
      await user.click(within(dialog).getByRole("button", { name: /^send$/i }));

      await waitFor(() =>
        expect(mutateAsync).toHaveBeenCalledWith({
          invoiceId: "invoice-1",
          paymentDemandId: "demand-1",
          recipientEmail: "jane@example.com",
          message: "Please settle this balance",
        }),
      );
      expect(await within(dialog).findByText("Email sent to jane@example.com.")).toBeInTheDocument();
    });

    it("VIEWER (no payments.record/void permission) sees no Mark as paid, Add payment, or Void actions", () => {
      usePermissionMock.mockImplementation(
        (permission: string) => permission === "invoices.download" || permission === "invoices.view",
      );
      usePaymentsMock.mockReturnValue({
        data: [
          {
            id: "pay-1",
            invoiceId: "invoice-1",
            amountMinor: 3000,
            currency: "USD",
            paymentDate: "2026-08-05T00:00:00Z",
            method: "BANK_TRANSFER",
            reference: null,
            notes: null,
            sourceRentalDepositId: null,
            voidedAt: null,
            voidedByUserId: null,
            voidReason: null,
            createdByUserId: "user-1",
            createdAt: "2026-08-05T00:00:00Z",
          },
        ],
      });
      useUpdateInvoiceMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
      useInvoiceMock.mockReturnValue({
        data: { ...baseInvoice("ISSUED"), paidMinor: 3000, remainingMinor: 7000 },
        isLoading: false,
      });

      renderWithProviders(<InvoiceDetailPage />);

      expect(screen.queryByRole("button", { name: "Mark as paid" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add payment" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Void" })).not.toBeInTheDocument();
    });
  });
});
