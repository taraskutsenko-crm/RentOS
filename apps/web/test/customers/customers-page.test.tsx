import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    const table = within(screen.getByRole("table"));

    expect(table.getByText("Jane Smith")).toBeInTheDocument();
    expect(table.getByText("Acme Corp")).toBeInTheDocument();
    expect(table.getByText("jane@acme.com")).toBeInTheDocument();
    expect(table.getByText("Active")).toBeInTheDocument();
  });

  it("shows a loading state", () => {
    useCustomersMock.mockReturnValue({ data: undefined, isLoading: true });

    renderWithProviders(<CustomersPage />);

    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
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

  it("selects a row, then bulk-deletes it via the confirm dialog", async () => {
    const deleteMutateAsync = vi.fn().mockResolvedValue(undefined);
    useDeleteCustomerMock.mockReturnValue({ mutateAsync: deleteMutateAsync, isPending: false });
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

    const user = userEvent.setup();
    renderWithProviders(<CustomersPage />);

    await user.click(screen.getByRole("checkbox", { name: /select row/i }));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(deleteMutateAsync).toHaveBeenCalledWith("c1");
  });
});
