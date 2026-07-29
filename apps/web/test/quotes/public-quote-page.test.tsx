import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PublicQuotePage from "../../src/app/quote/[token]/page";
import { renderWithProviders } from "../test-utils";

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "test-token" }),
}));

const usePublicQuoteMock = vi.fn();
const useAcceptPublicQuoteMock = vi.fn();
const useRejectPublicQuoteMock = vi.fn();
vi.mock("../../src/hooks/use-public-quote", () => ({
  usePublicQuote: (...args: unknown[]) => usePublicQuoteMock(...args),
  useAcceptPublicQuote: () => useAcceptPublicQuoteMock(),
  useRejectPublicQuote: () => useRejectPublicQuoteMock(),
  publicQuotePdfUrl: (token: string) => `http://api.test/public/quotes/${token}/pdf`,
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
    termsAndConditions: null,
    acceptedAt: null,
    acceptedBy: null,
    rejectedAt: null,
    rejectionReason: null,
    customer: { firstName: "Jane", lastName: "Doe", company: null },
    items: [{ id: "item-1", name: "Generator A", quantity: 1, lineTotalMinor: 3000 }],
    availabilityWarnings: [],
  };
}

describe("PublicQuotePage", () => {
  beforeEach(() => {
    useAcceptPublicQuoteMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useRejectPublicQuoteMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("shows a loading state while the quote is being fetched", () => {
    usePublicQuoteMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    renderWithProviders(<PublicQuotePage />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows a not-found message for an invalid or expired token", () => {
    // apiErrorMessage only surfaces a message for ApiError instances — a
    // generic Error (as here) falls back to the translated notFound copy.
    usePublicQuoteMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Not Found"),
    });

    renderWithProviders(<PublicQuotePage />);

    expect(screen.getByText(/this quote link is invalid or has expired/i)).toBeInTheDocument();
  });

  it("renders quote details, items, and totals", () => {
    usePublicQuoteMock.mockReturnValue({
      data: baseQuote("VIEWED"),
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<PublicQuotePage />);

    expect(screen.getByText("Q-2026-000001")).toBeInTheDocument();
    expect(screen.getByText(/jane doe/i)).toBeInTheDocument();
    expect(screen.getByText("Generator A")).toBeInTheDocument();
  });

  it("shows accept/reject actions for a SENT or VIEWED quote", () => {
    usePublicQuoteMock.mockReturnValue({
      data: baseQuote("VIEWED"),
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<PublicQuotePage />);

    expect(screen.getByRole("button", { name: /^accept$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^reject$/i })).toBeInTheDocument();
  });

  it("hides accept/reject actions once the quote is already ACCEPTED", () => {
    usePublicQuoteMock.mockReturnValue({
      data: { ...baseQuote("ACCEPTED"), acceptedBy: "Jane Doe" },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<PublicQuotePage />);

    expect(screen.queryByRole("button", { name: /^accept$/i })).not.toBeInTheDocument();
  });

  it("calls the accept mutation when the accept button is clicked", async () => {
    usePublicQuoteMock.mockReturnValue({
      data: baseQuote("SENT"),
      isLoading: false,
      isError: false,
    });
    const acceptMutateAsync = vi.fn().mockResolvedValue(undefined);
    useAcceptPublicQuoteMock.mockReturnValue({ mutateAsync: acceptMutateAsync, isPending: false });
    const user = userEvent.setup();

    renderWithProviders(<PublicQuotePage />);
    await user.click(screen.getByRole("button", { name: /^accept$/i }));

    await waitFor(() => expect(acceptMutateAsync).toHaveBeenCalled());
  });

  it("labels acceptance clearly as not a qualified electronic signature", () => {
    usePublicQuoteMock.mockReturnValue({
      data: baseQuote("SENT"),
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<PublicQuotePage />);

    expect(screen.getByText(/not a qualified electronic signature/i)).toBeInTheDocument();
  });
});
