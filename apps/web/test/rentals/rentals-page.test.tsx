import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RentalsPage from "../../src/app/app/rentals/page";
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

const useRentalsMock = vi.fn();
vi.mock("../../src/hooks/use-rentals", () => ({
  useRentals: (...args: unknown[]) => useRentalsMock(...args),
}));

const baseRental = {
  id: "r1",
  rentalNumber: "RNT-000001",
  status: "DRAFT",
  plannedStart: "2026-08-01T00:00:00Z",
  plannedEnd: "2026-08-04T00:00:00Z",
  totalMinor: 3000,
  currency: "USD",
  customer: { firstName: "Jane", lastName: "Doe" },
};

describe("RentalsPage", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
  });

  // 1. Rental list rendering
  it("renders a row per rental with number, customer, status, and total", () => {
    usePermissionMock.mockReturnValue(false);
    useRentalsMock.mockReturnValue({
      data: { items: [baseRental], total: 1, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<RentalsPage />);
    const table = within(screen.getByRole("table"));

    expect(table.getByText("RNT-000001")).toBeInTheDocument();
    expect(table.getByText("Jane Doe")).toBeInTheDocument();
    expect(table.getByRole("cell", { name: "Draft" })).toBeInTheDocument();
  });

  it("renders the empty state when there are no rentals", () => {
    usePermissionMock.mockReturnValue(false);
    useRentalsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<RentalsPage />);

    expect(screen.getByText(/no rentals found/i)).toBeInTheDocument();
  });

  it("shows an error message when the query fails", () => {
    usePermissionMock.mockReturnValue(false);
    useRentalsMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    renderWithProviders(<RentalsPage />);

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  // 2. Search and filter behavior
  it("updates the search query param as the user types", async () => {
    usePermissionMock.mockReturnValue(false);
    useRentalsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();

    renderWithProviders(<RentalsPage />);
    await user.type(screen.getByPlaceholderText(/search rentals/i), "RNT-1");

    await waitFor(() => {
      expect(useRentalsMock).toHaveBeenLastCalledWith(
        "tenant-1",
        expect.objectContaining({ search: "RNT-1" }),
      );
    });
  });

  it("filters by status", async () => {
    usePermissionMock.mockReturnValue(false);
    useRentalsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();

    renderWithProviders(<RentalsPage />);
    await user.selectOptions(screen.getByDisplayValue(/all statuses/i), "RESERVED");

    expect(useRentalsMock).toHaveBeenLastCalledWith(
      "tenant-1",
      expect.objectContaining({ status: "RESERVED" }),
    );
  });

  // 9. Permission-based controls
  it("hides the new rental button without rentals.create", () => {
    usePermissionMock.mockReturnValue(false);
    useRentalsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<RentalsPage />);

    expect(screen.queryByRole("link", { name: /new rental/i })).not.toBeInTheDocument();
  });

  it("shows the new rental button with rentals.create", () => {
    usePermissionMock.mockReturnValue(true);
    useRentalsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<RentalsPage />);

    expect(screen.getByRole("link", { name: /new rental/i })).toBeInTheDocument();
  });
});
