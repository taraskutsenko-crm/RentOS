import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PortalRentalsPage from "../../src/app/portal/(shell)/rentals/page";
import { renderWithProviders } from "../test-utils";

const usePortalRentalsMock = vi.fn();
vi.mock("../../src/hooks/use-portal-rentals", () => ({
  usePortalRentals: (...args: unknown[]) => usePortalRentalsMock(...args),
}));

const usePortalMeMock = vi.fn();
vi.mock("../../src/hooks/use-portal-auth", () => ({
  usePortalMe: () => usePortalMeMock(),
}));

const baseRental = {
  id: "r1",
  rentalNumber: "RNT-000001",
  status: "DRAFT",
  plannedStart: "2026-08-01T00:00:00Z",
  plannedEnd: "2026-08-04T00:00:00Z",
  totalMinor: 3000,
  currency: "USD",
};

describe("PortalRentalsPage", () => {
  beforeEach(() => {
    usePortalRentalsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });
    usePortalMeMock.mockReturnValue({
      data: { customer: { firstName: "Jane" }, tenant: { id: "t1", name: "Co", timezone: "UTC" } },
    });
  });

  it("renders a row per rental with number, status, dates, and total", () => {
    usePortalRentalsMock.mockReturnValue({
      data: { items: [baseRental], total: 1, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<PortalRentalsPage />);
    const table = within(screen.getByRole("table"));

    expect(table.getByText("RNT-000001")).toBeInTheDocument();
    expect(table.getByRole("cell", { name: "Draft" })).toBeInTheDocument();
  });

  it("renders the empty state when there are no rentals", () => {
    renderWithProviders(<PortalRentalsPage />);

    expect(screen.getByText(/no rentals found/i)).toBeInTheDocument();
  });

  it("shows an error message with a retry action when the query fails", () => {
    usePortalRentalsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });

    renderWithProviders(<PortalRentalsPage />);

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PortalRentalsPage />);

    await user.selectOptions(screen.getByDisplayValue(/all statuses/i), "RESERVED");

    expect(usePortalRentalsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "RESERVED" }),
    );
  });

  it("sorts by rental number when the column header is clicked", async () => {
    usePortalRentalsMock.mockReturnValue({
      data: { items: [baseRental], total: 1, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderWithProviders(<PortalRentalsPage />);

    await user.click(screen.getByRole("button", { name: /rental number/i }));

    await waitFor(() => {
      expect(usePortalRentalsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: "rentalNumber", sortDirection: "asc" }),
      );
    });
  });
});
