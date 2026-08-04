import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SelectTenantPage from "../../src/app/app/select-tenant/page";
import { renderWithProviders } from "../test-utils";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

const useTenantsMock = vi.fn();
const useSelectTenantMock = vi.fn();
vi.mock("../../src/hooks/use-auth", () => ({
  useTenants: () => useTenantsMock(),
  useSelectTenant: () => useSelectTenantMock(),
}));

const setCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => [null, setCurrentTenantIdMock],
}));

describe("SelectTenantPage", () => {
  beforeEach(() => {
    pushMock.mockReset();
    setCurrentTenantIdMock.mockReset();
    useTenantsMock.mockReset();
    useSelectTenantMock.mockReset();
  });

  it("lists every tenant the user belongs to", () => {
    useTenantsMock.mockReturnValue({
      data: {
        tenants: [
          { id: "t1", name: "Acme Rentals" },
          { id: "t2", name: "Beta Co" },
        ],
      },
      isLoading: false,
    });
    useSelectTenantMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false, isError: false });

    renderWithProviders(<SelectTenantPage />);

    expect(screen.getByRole("button", { name: "Acme Rentals" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Beta Co" })).toBeInTheDocument();
  });

  it("shows the empty state when the user has no tenants", () => {
    useTenantsMock.mockReturnValue({ data: { tenants: [] }, isLoading: false });
    useSelectTenantMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false, isError: false });

    renderWithProviders(<SelectTenantPage />);

    expect(screen.getByText(/don't belong to any company yet/i)).toBeInTheDocument();
  });

  it("selects a tenant and navigates to /app", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ tenant: { id: "t1" }, role: "OWNER" });
    useTenantsMock.mockReturnValue({
      data: { tenants: [{ id: "t1", name: "Acme Rentals" }] },
      isLoading: false,
    });
    useSelectTenantMock.mockReturnValue({ mutateAsync, isPending: false, isError: false });

    const user = userEvent.setup();
    renderWithProviders(<SelectTenantPage />);

    await user.click(screen.getByRole("button", { name: "Acme Rentals" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith("t1"));
    expect(setCurrentTenantIdMock).toHaveBeenCalledWith("t1");
    expect(pushMock).toHaveBeenCalledWith("/app");
  });

  it("shows a generic error alert when selecting a tenant fails", () => {
    useTenantsMock.mockReturnValue({
      data: { tenants: [{ id: "t1", name: "Acme Rentals" }] },
      isLoading: false,
    });
    useSelectTenantMock.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("network down")),
      isPending: false,
      isError: true,
    });

    renderWithProviders(<SelectTenantPage />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
