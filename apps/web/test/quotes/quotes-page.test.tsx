import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import QuotesPage from "../../src/app/app/quotes/page";
import { renderWithProviders } from "../test-utils";

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const usePermissionMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  usePermission: (...args: unknown[]) => usePermissionMock(...args),
  useTenantTimezone: () => undefined,
}));

const useQuotesMock = vi.fn();
vi.mock("../../src/hooks/use-quotes", () => ({
  useQuotes: (...args: unknown[]) => useQuotesMock(...args),
}));

const baseQuote = {
  id: "q1",
  quoteNumber: "Q-2026-000001",
  status: "DRAFT",
  validUntil: "2026-09-01T00:00:00Z",
  totalMinor: 3000,
  currency: "USD",
  customer: { firstName: "Jane", lastName: "Doe" },
};

describe("QuotesPage", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
  });

  it("renders a row per quote with number, customer, status, and total", () => {
    usePermissionMock.mockReturnValue(false);
    useQuotesMock.mockReturnValue({
      data: { items: [baseQuote], total: 1, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<QuotesPage />);
    const table = within(screen.getByRole("table"));

    expect(table.getByText("Q-2026-000001")).toBeInTheDocument();
    expect(table.getByText("Jane Doe")).toBeInTheDocument();
    expect(table.getByRole("cell", { name: "Draft" })).toBeInTheDocument();
  });

  it("renders the empty state when there are no quotes", () => {
    usePermissionMock.mockReturnValue(false);
    useQuotesMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<QuotesPage />);

    expect(screen.getByText(/no quotes found/i)).toBeInTheDocument();
  });

  it("shows an error message when the query fails", () => {
    usePermissionMock.mockReturnValue(false);
    useQuotesMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    renderWithProviders(<QuotesPage />);

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it("updates the search query param as the user types", async () => {
    usePermissionMock.mockReturnValue(false);
    useQuotesMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();

    renderWithProviders(<QuotesPage />);
    await user.type(screen.getByPlaceholderText(/search quotes/i), "Q-1");

    await waitFor(() => {
      expect(useQuotesMock).toHaveBeenLastCalledWith(
        "tenant-1",
        expect.objectContaining({ search: "Q-1" }),
      );
    });
  });

  it("filters by status", async () => {
    usePermissionMock.mockReturnValue(false);
    useQuotesMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();

    renderWithProviders(<QuotesPage />);
    await user.selectOptions(screen.getByDisplayValue(/all statuses/i), "ACCEPTED");

    expect(useQuotesMock).toHaveBeenLastCalledWith(
      "tenant-1",
      expect.objectContaining({ status: "ACCEPTED" }),
    );
  });

  it("hides the new quote button without quotes.create", () => {
    usePermissionMock.mockReturnValue(false);
    useQuotesMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<QuotesPage />);

    expect(screen.queryByRole("link", { name: /new quote/i })).not.toBeInTheDocument();
  });

  it("shows the new quote button with quotes.create", () => {
    usePermissionMock.mockReturnValue(true);
    useQuotesMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<QuotesPage />);

    expect(screen.getByRole("link", { name: /new quote/i })).toBeInTheDocument();
  });
});
