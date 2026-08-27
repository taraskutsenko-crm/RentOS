import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import QuoteDetailPage from "../../src/app/app/quotes/[id]/page";
import { renderWithProviders } from "../test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: "quote-1" }),
}));

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const usePermissionMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  usePermission: (...args: unknown[]) => usePermissionMock(...args),
  useTenantTimezone: () => undefined,
}));

const useQuoteMock = vi.fn();
const useQuoteTimelineMock = vi.fn();
const useDeleteQuoteMock = vi.fn();
const useSendQuoteMock = vi.fn();
const useAcceptQuoteMock = vi.fn();
const useRejectQuoteMock = vi.fn();
const useCancelQuoteMock = vi.fn();
const useDuplicateQuoteMock = vi.fn();
const useConvertQuoteToRentalMock = vi.fn();
const useRegenerateQuotePdfMock = vi.fn();
const useQuoteEmailDeliveriesMock = vi.fn();
vi.mock("../../src/hooks/use-quotes", () => ({
  useQuote: (...args: unknown[]) => useQuoteMock(...args),
  useQuoteTimeline: (...args: unknown[]) => useQuoteTimelineMock(...args),
  useDeleteQuote: () => useDeleteQuoteMock(),
  useSendQuote: () => useSendQuoteMock(),
  useAcceptQuote: () => useAcceptQuoteMock(),
  useRejectQuote: () => useRejectQuoteMock(),
  useCancelQuote: () => useCancelQuoteMock(),
  useDuplicateQuote: () => useDuplicateQuoteMock(),
  useConvertQuoteToRental: () => useConvertQuoteToRentalMock(),
  useRegenerateQuotePdf: () => useRegenerateQuotePdfMock(),
  useQuoteEmailDeliveries: (...args: unknown[]) => useQuoteEmailDeliveriesMock(...args),
  quotePdfUrl: (tenantId: string | null, id: string) =>
    `http://api.test/tenants/${tenantId}/quotes/${id}/pdf`,
}));

function baseQuote(status: string) {
  return {
    id: "quote-1",
    quoteNumber: "Q-2026-000001",
    status,
    issueDate: "2026-08-01T00:00:00Z",
    validUntil: "2026-09-01T00:00:00Z",
    plannedStart: "2026-08-10T00:00:00Z",
    plannedEnd: "2026-08-17T00:00:00Z",
    currency: "USD",
    subtotalMinor: 3000,
    discountTotalMinor: 0,
    taxTotalMinor: 0,
    depositTotalMinor: 0,
    totalMinor: 3000,
    customerNotes: null,
    internalNotes: null,
    termsAndConditions: null,
    customer: {
      id: "customer-1",
      firstName: "Jane",
      lastName: "Doe",
      company: null,
      phone: null,
      email: null,
    },
    items: [],
    convertedRental: null,
    platformDocuments: [],
    availabilityWarnings: [],
  };
}

describe("QuoteDetailPage", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    useQuoteTimelineMock.mockReturnValue({ data: [] });
    useDeleteQuoteMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useSendQuoteMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useAcceptQuoteMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useRejectQuoteMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useCancelQuoteMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useDuplicateQuoteMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useConvertQuoteToRentalMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useRegenerateQuotePdfMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useQuoteEmailDeliveriesMock.mockReturnValue({ data: [] });
  });

  it("renders the quote header with number, customer, and status", () => {
    usePermissionMock.mockReturnValue(false);
    useQuoteMock.mockReturnValue({ data: baseQuote("DRAFT"), isLoading: false });

    renderWithProviders(<QuoteDetailPage />);

    expect(screen.getByRole("heading", { name: "Q-2026-000001" })).toBeInTheDocument();
    expect(screen.getAllByText(/jane doe/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  // Chapter 8: Customer card links to the customer's own detail page
  it("renders a Customer card linking to the customer's detail page", () => {
    usePermissionMock.mockReturnValue(false);
    useQuoteMock.mockReturnValue({
      data: {
        ...baseQuote("DRAFT"),
        customer: {
          id: "customer-1",
          firstName: "Jane",
          lastName: "Doe",
          company: "Acme Events Co",
          phone: "555-1234",
          email: "jane@example.com",
        },
      },
      isLoading: false,
    });

    renderWithProviders(<QuoteDetailPage />);

    const customerLink = screen.getByRole("link", { name: "Jane Doe" });
    expect(customerLink).toHaveAttribute("href", "/app/customers/customer-1");
    expect(screen.getByText("Acme Events Co")).toBeInTheDocument();
    expect(screen.getByText("555-1234")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
  });

  // Chapter 8: Smart Summary shows the real quote value/deposit/items — never fabricated
  it("shows the quote value, deposit total, and items count in the summary strip", () => {
    usePermissionMock.mockReturnValue(false);
    useQuoteMock.mockReturnValue({
      data: {
        ...baseQuote("DRAFT"),
        totalMinor: 12000,
        depositTotalMinor: 500,
        items: [
          {
            id: "item-1",
            itemType: "ASSET",
            assetId: "asset-1",
            name: "Generator A",
            billingMode: "DAILY",
            quantity: 1,
            discountTotalMinor: 0,
            taxTotalMinor: 0,
            lineTotalMinor: 12000,
            asset: { id: "asset-1", name: "Generator A" },
          },
        ],
      },
      isLoading: false,
    });

    renderWithProviders(<QuoteDetailPage />);

    const quoteValueCard = screen.getByText("Quote value").closest("div");
    expect(quoteValueCard).toHaveTextContent("120");
    const depositCard = screen.getByText("Deposit total").closest("div");
    expect(depositCard).toHaveTextContent("5");
    const itemsCard = screen.getByText("Items").closest("div");
    expect(itemsCard).toHaveTextContent("1");
  });

  // Chapter 8: the items table links an asset-bound item to its asset detail page
  it("links an asset-bound item to its asset detail page", () => {
    usePermissionMock.mockReturnValue(false);
    useQuoteMock.mockReturnValue({
      data: {
        ...baseQuote("DRAFT"),
        items: [
          {
            id: "item-1",
            itemType: "ASSET",
            assetId: "asset-1",
            name: "Generator A",
            billingMode: "DAILY",
            quantity: 1,
            discountTotalMinor: 0,
            taxTotalMinor: 0,
            lineTotalMinor: 3000,
            asset: { id: "asset-1", name: "Generator A" },
          },
        ],
      },
      isLoading: false,
    });

    renderWithProviders(<QuoteDetailPage />);

    const assetLink = screen.getByRole("link", { name: "Generator A" });
    expect(assetLink).toHaveAttribute("href", "/app/assets/asset-1");
  });

  // Chapter 8: Documents card — honest empty state when nothing is linked
  it("shows the honest empty state in the Documents card when no converted rental or documents exist", () => {
    usePermissionMock.mockReturnValue(false);
    useQuoteMock.mockReturnValue({ data: baseQuote("DRAFT"), isLoading: false });

    renderWithProviders(<QuoteDetailPage />);

    expect(screen.getByText(/no documents linked to this quote yet/i)).toBeInTheDocument();
  });

  // Chapter 8: Documents card — linked platform documents, never fabricated
  it("renders linked platform documents in the Documents card", () => {
    usePermissionMock.mockReturnValue(false);
    useQuoteMock.mockReturnValue({
      data: {
        ...baseQuote("DRAFT"),
        platformDocuments: [
          {
            id: "doc-1",
            documentType: "CONTRACT",
            customTypeName: null,
            documentNumber: "DOC-000001",
            status: "SENT",
            title: null,
            createdAt: "2026-08-01T00:00:00Z",
          },
        ],
      },
      isLoading: false,
    });

    renderWithProviders(<QuoteDetailPage />);

    const documentLink = screen.getByRole("link", { name: "DOC-000001" });
    expect(documentLink).toHaveAttribute("href", "/app/documents/doc-1");
  });

  it("shows the send action for a DRAFT quote when the user has quotes.send", () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "quotes.send");
    useQuoteMock.mockReturnValue({ data: baseQuote("DRAFT"), isLoading: false });

    renderWithProviders(<QuoteDetailPage />);

    expect(screen.getByRole("button", { name: /send quote/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^accept$/i })).not.toBeInTheDocument();
  });

  it("shows accept/reject actions for a SENT quote when the user has those permissions", async () => {
    usePermissionMock.mockImplementation(
      (permission: string) => permission === "quotes.accept" || permission === "quotes.reject",
    );
    useQuoteMock.mockReturnValue({ data: baseQuote("SENT"), isLoading: false });
    const acceptMutateAsync = vi.fn().mockResolvedValue(undefined);
    useAcceptQuoteMock.mockReturnValue({ mutateAsync: acceptMutateAsync, isPending: false });
    const user = userEvent.setup();

    renderWithProviders(<QuoteDetailPage />);
    await user.click(screen.getByRole("button", { name: /^accept$/i }));

    await waitFor(() => expect(acceptMutateAsync).toHaveBeenCalledWith({ id: "quote-1" }));
  });

  it("shows the convert action only for an ACCEPTED quote", () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "quotes.convert");
    useQuoteMock.mockReturnValue({ data: baseQuote("ACCEPTED"), isLoading: false });

    renderWithProviders(<QuoteDetailPage />);

    expect(screen.getByRole("button", { name: /convert to rental/i })).toBeInTheDocument();
  });

  it("hides the convert action for an ACCEPTED quote that already has a converted rental", () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "quotes.convert");
    useQuoteMock.mockReturnValue({
      data: {
        ...baseQuote("ACCEPTED"),
        convertedRental: { id: "rental-1", rentalNumber: "RNT-000001" },
      },
      isLoading: false,
    });

    renderWithProviders(<QuoteDetailPage />);

    expect(screen.queryByRole("button", { name: /convert to rental/i })).not.toBeInTheDocument();
  });

  it("hides every lifecycle action when the user has no quote permissions", () => {
    usePermissionMock.mockReturnValue(false);
    useQuoteMock.mockReturnValue({ data: baseQuote("SENT"), isLoading: false });

    renderWithProviders(<QuoteDetailPage />);

    expect(screen.queryByRole("button", { name: /send quote/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^accept$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /edit quote/i })).not.toBeInTheDocument();
  });

  it("shows the error message when a lifecycle action fails", async () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "quotes.send");
    useQuoteMock.mockReturnValue({ data: baseQuote("DRAFT"), isLoading: false });
    useSendQuoteMock.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Cannot send a quote with no items")),
      isPending: false,
    });
    const user = userEvent.setup();

    renderWithProviders(<QuoteDetailPage />);
    await user.click(screen.getByRole("button", { name: /send quote/i }));

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });

  it("shows a link to the converted rental once CONVERTED", () => {
    usePermissionMock.mockReturnValue(false);
    useQuoteMock.mockReturnValue({
      data: {
        ...baseQuote("CONVERTED"),
        convertedRental: { id: "rental-1", rentalNumber: "RNT-000001" },
      },
      isLoading: false,
    });

    renderWithProviders(<QuoteDetailPage />);

    expect(screen.getByRole("link", { name: "RNT-000001" })).toHaveAttribute(
      "href",
      "/app/rentals/rental-1",
    );
  });

  // Email delivery truthfulness (production-infrastructure pass) — a
  // persisted, retryable record of each send attempt, not just an
  // audit-log line on failure.
  it("shows the truthful email delivery history for this quote", () => {
    usePermissionMock.mockReturnValue(false);
    useQuoteMock.mockReturnValue({ data: baseQuote("SENT"), isLoading: false });
    useQuoteEmailDeliveriesMock.mockReturnValue({
      data: [
        {
          id: "delivery-1",
          recipientEmail: "jane@example.com",
          status: "NOT_CONFIGURED",
          errorMessage: "No email provider is configured",
        },
      ],
    });

    renderWithProviders(<QuoteDetailPage />);

    expect(screen.getByText(/jane@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/Not configured/)).toBeInTheDocument();
  });
});
