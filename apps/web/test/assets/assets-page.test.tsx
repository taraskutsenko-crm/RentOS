import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AssetsPage from "../../src/app/app/assets/page";
import { renderWithProviders } from "../test-utils";

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const usePermissionMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  usePermission: (...args: unknown[]) => usePermissionMock(...args),
}));

const useAssetsMock = vi.fn();
vi.mock("../../src/hooks/use-assets", () => ({
  useAssets: (...args: unknown[]) => useAssetsMock(...args),
}));

const useAssetCategoriesMock = vi.fn();
vi.mock("../../src/hooks/use-asset-categories", () => ({
  useAssetCategories: (...args: unknown[]) => useAssetCategoriesMock(...args),
}));

const useAssetStatusesMock = vi.fn();
vi.mock("../../src/hooks/use-asset-statuses", () => ({
  useAssetStatuses: (...args: unknown[]) => useAssetStatusesMock(...args),
}));

describe("AssetsPage", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    useAssetCategoriesMock.mockReturnValue({
      data: { items: [{ id: "cat-1", name: "Vehicles" }] },
    });
    useAssetStatusesMock.mockReturnValue({
      data: [{ id: "status-1", name: "Available", code: "AVAILABLE" }],
    });
  });

  // 1. Asset list rendering
  it("renders a row per asset with internal number, name, category, and status", () => {
    usePermissionMock.mockReturnValue(false);
    useAssetsMock.mockReturnValue({
      data: {
        items: [
          {
            id: "a1",
            internalNumber: "AST-0001",
            name: "Truck 1",
            category: { name: "Vehicles" },
            currentStatus: { name: "Available" },
            isRentable: true,
            primaryImage: null,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<AssetsPage />);

    expect(screen.getAllByText("AST-0001").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Truck 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Vehicles").length).toBeGreaterThan(0);
  });

  it("renders the empty state when there are no assets", () => {
    usePermissionMock.mockReturnValue(false);
    useAssetsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<AssetsPage />);

    expect(screen.getByText(/no assets found/i)).toBeInTheDocument();
  });

  it("shows a loading skeleton while fetching", () => {
    usePermissionMock.mockReturnValue(false);
    useAssetsMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    renderWithProviders(<AssetsPage />);

    expect(screen.queryByText(/no assets found/i)).not.toBeInTheDocument();
  });

  it("shows an error message when the query fails", () => {
    usePermissionMock.mockReturnValue(false);
    useAssetsMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    renderWithProviders(<AssetsPage />);

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  // 2. Search and filter behavior
  it("updates the search query param as the user types", async () => {
    usePermissionMock.mockReturnValue(false);
    useAssetsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();

    renderWithProviders(<AssetsPage />);
    await user.type(screen.getByPlaceholderText(/search assets/i), "Ford");

    expect(useAssetsMock).toHaveBeenLastCalledWith(
      "tenant-1",
      expect.objectContaining({ search: "Ford" }),
    );
  });

  it("filters by category when a category is selected", async () => {
    usePermissionMock.mockReturnValue(false);
    useAssetsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();

    renderWithProviders(<AssetsPage />);
    await user.selectOptions(screen.getByDisplayValue(/all categories/i), "cat-1");

    expect(useAssetsMock).toHaveBeenLastCalledWith(
      "tenant-1",
      expect.objectContaining({ categoryId: "cat-1" }),
    );
  });

  // 9. Permission-based controls
  it("hides the create button when the user lacks assets.create", () => {
    usePermissionMock.mockReturnValue(false);
    useAssetsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<AssetsPage />);

    expect(screen.queryByRole("link", { name: /new asset/i })).not.toBeInTheDocument();
  });

  it("shows the create button when the user has assets.create", () => {
    usePermissionMock.mockReturnValue(true);
    useAssetsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<AssetsPage />);

    expect(screen.getByRole("link", { name: /new asset/i })).toBeInTheDocument();
  });
});
