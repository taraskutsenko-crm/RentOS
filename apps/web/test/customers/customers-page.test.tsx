import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CustomersPage from "../../src/app/app/customers/page";
import { renderWithProviders } from "../test-utils";

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const useCustomersMock = vi.fn();
const useDeleteCustomerMock = vi.fn();
vi.mock("../../src/hooks/use-customers", () => ({
  useCustomers: (...args: unknown[]) => useCustomersMock(...args),
  useDeleteCustomer: () => useDeleteCustomerMock(),
}));

describe("CustomersPage", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    useDeleteCustomerMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("renders the empty state when there are no customers", () => {
    useCustomersMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
    });

    renderWithProviders(<CustomersPage />);

    expect(screen.getByText(/no customers found/i)).toBeInTheDocument();
  });

  it("renders a table row per customer with name, company, email, and status", () => {
    useCustomersMock.mockReturnValue({
      data: {
        items: [
          {
            id: "c1",
            firstName: "Jane",
            lastName: "Smith",
            company: "Acme Corp",
            email: "jane@acme.com",
            status: "ACTIVE",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      },
      isLoading: false,
    });

    renderWithProviders(<CustomersPage />);

    expect(screen.getByText("Jane")).toBeInTheDocument();
    expect(screen.getByText("Smith")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("jane@acme.com")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Active" })).toBeInTheDocument();
  });

  it("shows a loading state", () => {
    useCustomersMock.mockReturnValue({ data: undefined, isLoading: true });

    renderWithProviders(<CustomersPage />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("passes the current tenant id and query params to useCustomers", () => {
    useCustomersMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
    });

    renderWithProviders(<CustomersPage />);

    expect(useCustomersMock).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({ page: 1, pageSize: 20 }),
    );
  });
});
